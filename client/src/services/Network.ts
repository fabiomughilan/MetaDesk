import { Client, Room } from 'colyseus.js'
import { IComputer, IOfficeState, IPlayer, IWhiteboard } from '../../../types/IOfficeState'
import { Message } from '../../../types/Messages'
import { IRoomData, RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import WebRTC from '../web/WebRTC'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap } from '../stores/UserStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
} from '../stores/RoomStore'
import {
  pushChatMessage,
  pushPlayerJoinedMessage,
  pushPlayerLeftMessage,
} from '../stores/ChatStore'
import { setWhiteboardUrls } from '../stores/WhiteboardStore'

export default class Network {
  private client: Client
  private room?: Room<IOfficeState>
  private lobby!: Room
  webRTC?: WebRTC

  mySessionId!: string

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')
    const endpoint =
      process.env.NODE_ENV === 'production'
        ? import.meta.env.VITE_SERVER_URL
        : `${protocol}//${window.location.hostname}:8080`
    this.client = new Client(endpoint)
    this.joinLobbyRoom().then(() => {
      store.dispatch(setLobbyJoined(true))
    })

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
    phaserEvents.on(Event.PLAYER_DISCONNECTED, this.playerStreamDisconnect, this)
  }

  /**
   * method to join Colyseus' built-in LobbyRoom, which automatically notifies
   * connected clients whenever rooms with "realtime listing" have updates
   */
  async joinLobbyRoom() {
    this.lobby = await this.client.joinOrCreate(RoomType.LOBBY)

    this.lobby.onMessage('rooms', (rooms) => {
      store.dispatch(setAvailableRooms(rooms))
    })

    this.lobby.onMessage('+', ([roomId, room]) => {
      store.dispatch(addAvailableRooms({ roomId, room }))
    })

    this.lobby.onMessage('-', (roomId) => {
      store.dispatch(removeAvailableRooms(roomId))
    })
  }

  // method to join the public lobby
  async joinOrCreatePublic() {
    this.room = await this.client.joinOrCreate(RoomType.PUBLIC)
    this.initialize()
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    this.room = await this.client.joinById(roomId, { password })
    this.initialize()
  }

  // method to create a custom room
  async createCustom(roomData: IRoomData) {
    const { name, description, password, autoDispose } = roomData
    this.room = await this.client.create(RoomType.CUSTOM, {
      name,
      description,
      password,
      autoDispose,
    })
    this.initialize()
  }

  // set up all network listeners before the game starts
  initialize() {
    if (!this.room) return

    this.lobby.leave()
    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))
    this.webRTC = new WebRTC(this.mySessionId, this)

    // Wait for the first state synchronization before setting up listeners
    this.room.onStateChange.once((state) => {
      console.log('State received, setting up listeners...')
      // Add a small delay to ensure MapSchema is fully initialized
      setTimeout(() => {
        this.setupStateListeners()
      }, 100)
    })

    // Handle room messages immediately
    this.setupMessageHandlers()
  }

  private setupStateListeners(retryCount = 0) {
    if (!this.room || !this.room.state) {
      console.warn('Room or state not available, cannot set up listeners')
      return
    }

    // Maximum 10 retries to prevent infinite loops
    if (retryCount >= 10) {
      console.error('Failed to initialize state listeners after 10 attempts, proceeding anyway...')
      this.forceSetupListeners()
      return
    }

    // Check if all required schemas are available
    const { players, computers, whiteboards, chatMessages } = this.room.state

    if (!players || !computers || !whiteboards || !chatMessages) {
      console.warn(`Schemas not ready (attempt ${retryCount + 1}/10), retrying in 200ms...`)
      setTimeout(() => this.setupStateListeners(retryCount + 1), 200)
      return
    }

    console.log('All schemas ready, setting up state listeners...')
    this.forceSetupListeners()
  }

  private forceSetupListeners() {
    if (!this.room || !this.room.state) return

    try {
      // Check if the onAdd method exists before calling it
      if (!this.room.state.players || typeof this.room.state.players.onAdd !== 'function') {
        console.warn('Players MapSchema onAdd method not available, using state change listeners instead')
        this.setupAlternativeListeners()
        return
      }

      // new instance added to the players MapSchema
      this.room.state.players.onAdd((player: IPlayer, key: string) => {
        if (key === this.mySessionId) return

        // If player already has a name, emit PLAYER_JOINED immediately
        if (player.name && player.name !== '') {
          phaserEvents.emit(Event.PLAYER_JOINED, player, key)
          store.dispatch(setPlayerNameMap({ id: key, name: player.name }))
          store.dispatch(pushPlayerJoinedMessage(player.name))
        }

        // track changes on every child object inside the players MapSchema
        ;(player as any).onChange = (changes: any[]) => {
          changes.forEach((change: any) => {
            const { field, value } = change
            console.log('Received player update:', { field, value, playerId: key })
            phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

            // when a new player finished setting up player name
            if (field === 'name' && value !== '') {
              phaserEvents.emit(Event.PLAYER_JOINED, player, key)
              store.dispatch(setPlayerNameMap({ id: key, name: value }))
              store.dispatch(pushPlayerJoinedMessage(value))
            }
          })
        }
      })

      // an instance removed from the players MapSchema
      this.room.state.players.onRemove((player: IPlayer, key: string) => {
        phaserEvents.emit(Event.PLAYER_LEFT, key)
        this.webRTC?.deleteVideoStream(key)
        this.webRTC?.deleteOnCalledVideoStream(key)
        store.dispatch(pushPlayerLeftMessage(player.name))
        store.dispatch(removePlayerNameMap(key))
      })

      // Check if computers onAdd exists
      if (this.room.state.computers && typeof this.room.state.computers.onAdd === 'function') {
        // new instance added to the computers MapSchema
        this.room.state.computers.onAdd((computer: IComputer, key: string) => {
          // track changes on every child object's connectedUser
          computer.connectedUser.onAdd((item, index) => {
            phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.COMPUTER)
          })
          computer.connectedUser.onRemove((item, index) => {
            phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.COMPUTER)
          })
        })
      }

      // Check if whiteboards onAdd exists
      if (this.room.state.whiteboards && typeof this.room.state.whiteboards.onAdd === 'function') {
        // new instance added to the whiteboards MapSchema
        this.room.state.whiteboards.onAdd((whiteboard: IWhiteboard, key: string) => {
          store.dispatch(
            setWhiteboardUrls({
              whiteboardId: key,
              roomId: whiteboard.roomId,
            })
          )
          // track changes on every child object's connectedUser
          whiteboard.connectedUser.onAdd((item, index) => {
            phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.WHITEBOARD)
          })
          whiteboard.connectedUser.onRemove((item, index) => {
            phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.WHITEBOARD)
          })
        })
      }

      // Check if chatMessages onAdd exists
      if (this.room.state.chatMessages && typeof this.room.state.chatMessages.onAdd === 'function') {
        // new instance added to the chatMessages ArraySchema
        this.room.state.chatMessages.onAdd((item, index) => {
          store.dispatch(pushChatMessage(item))
        })
      }

    } catch (error) {
      console.error('Error setting up state listeners, using fallback approach:', error)
      this.setupAlternativeListeners()
    }
  }

  private setupAlternativeListeners() {
    if (!this.room || !this.room.state) return

    console.log('Setting up alternative state change listeners...')
    
    // Use onStateChange as a fallback to monitor player changes
    this.room.onStateChange((state) => {
      // Handle player state changes
      if (state.players) {
        for (const [key, player] of state.players) {
          if (key !== this.mySessionId && player) {
            phaserEvents.emit(Event.PLAYER_UPDATED, 'all', player, key)
            
            if (player.name && player.name !== '') {
              phaserEvents.emit(Event.PLAYER_JOINED, player, key)
              store.dispatch(setPlayerNameMap({ id: key, name: player.name }))
            }
          }
        }
      }
    })
  }  private setupMessageHandlers() {
    if (!this.room) return

    // when the server sends room data
    this.room.onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    // when a user sends a message
    this.room.onMessage(Message.ADD_CHAT_MESSAGE, ({ clientId, content }) => {
      phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, clientId, content)
    })

    // when a peer disconnects with myPeer
    this.room.onMessage(Message.DISCONNECT_STREAM, (clientId: string) => {
      this.webRTC?.deleteOnCalledVideoStream(clientId)
    })

    // when a computer user stops sharing screen
    this.room.onMessage(Message.STOP_SCREEN_SHARE, (clientId: string) => {
      const computerState = store.getState().computer
      computerState.shareScreenManager?.onUserLeft(clientId)
    })
  }

  // method to register event listener and call back function when a item user added
  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  // method to register event listener and call back function when a item user added
  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)
  }

  // method to register event listener and call back function when a item user removed
  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  // method to register event listener and call back function when a player joined
  onPlayerJoined(callback: (Player: IPlayer, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)
  }

  // method to register event listener and call back function when a player left
  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  // method to register event listener and call back function when myPlayer is ready to connect
  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
  }

  // method to register event listener and call back function when my video is connected
  onMyPlayerVideoConnected(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_VIDEO_CONNECTED, callback, context)
  }

  // method to register event listener and call back function when a player updated
  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  // method to send player updates to Colyseus server
  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    console.log('Sending player update:', { x: currentX, y: currentY, anim: currentAnim })
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  // method to send ready-to-connect signal to Colyseus server
  videoConnected() {
    this.room?.send(Message.VIDEO_CONNECTED)
    phaserEvents.emit(Event.MY_PLAYER_VIDEO_CONNECTED)
  }

  // method to send stream-disconnection signal to Colyseus server
  playerStreamDisconnect(id: string) {
    this.room?.send(Message.DISCONNECT_STREAM, { clientId: id })
    this.webRTC?.deleteVideoStream(id)
  }

  connectToComputer(id: string) {
    this.room?.send(Message.CONNECT_TO_COMPUTER, { computerId: id })
  }

  disconnectFromComputer(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_COMPUTER, { computerId: id })
  }

  connectToWhiteboard(id: string) {
    this.room?.send(Message.CONNECT_TO_WHITEBOARD, { whiteboardId: id })
  }

  disconnectFromWhiteboard(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_WHITEBOARD, { whiteboardId: id })
  }

  onStopScreenShare(id: string) {
    this.room?.send(Message.STOP_SCREEN_SHARE, { computerId: id })
  }

  addChatMessage(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content: content })
  }
}
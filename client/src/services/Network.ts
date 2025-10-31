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

enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export default class Network {
  private client!: Client;
  private room?: Room<IOfficeState>;
  private lobby!: Room;
  webRTC?: WebRTC;
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private ready: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private connecting: boolean = false;
  private disconnecting: boolean = false;

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connectWithRetry();
    }, 5000); // Try to reconnect after 5 seconds
  }

  mySessionId!: string;
  private maxRetries = 5
  private retryDelay = 2000
  private lastRoomType?: RoomType
  private lastRoomData?: any

  private async attemptReconnection() {
    if (!this.lastRoomType) return

    try {
      switch (this.lastRoomType) {
        case RoomType.PUBLIC:
          await this.joinOrCreatePublic()
          break
        case RoomType.CUSTOM:
          if (this.lastRoomData) {
            if (this.lastRoomData.roomId) {
              await this.joinCustomById(this.lastRoomData.roomId, this.lastRoomData.password)
            } else {
              await this.createCustom(this.lastRoomData)
            }
          }
          break
      }
    } catch (error) {
      console.error('Failed to reconnect:', error)
    }
  }

  private async connectWithRetry(attempt: number = 1) {
    try {
      await this.joinLobbyRoom()
      store.dispatch(setLobbyJoined(true))
      console.log('Successfully connected to lobby')
      // If we succeed, try to reconnect to the previous room
      if (this.lastRoomType) {
        await this.attemptReconnection()
      }
    } catch (error) {
      console.warn(`Connection attempt ${attempt}/${this.maxRetries} failed:`, error)
      if (attempt < this.maxRetries) {
        const delay = Math.min(this.retryDelay * Math.pow(2, attempt - 1), 10000)
        console.log(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        await this.connectWithRetry(attempt + 1)
      } else {
        console.error('Failed to connect after', this.maxRetries, 'attempts')
        // Reset room state on final failure
        this.lastRoomType = undefined
        this.lastRoomData = undefined
      }
    }
  }

  constructor() {
    const endpoint = import.meta.env.VITE_SERVER_URL
    console.log('Connecting to server:', endpoint)
    
    if (!endpoint) {
      console.error('Server URL is not configured. Check VITE_SERVER_URL in .env file')
      return
    }
    
    // Initialize Colyseus client with reconnection options
    this.client = new Client(endpoint)

    // Initialize WebRTC early with a temporary ID
    const tempId = 'temp-' + Math.random().toString(36).substr(2, 9)
    console.log('Initializing WebRTC with temporary ID:', tempId)
    this.webRTC = new WebRTC(tempId, this)

    // Attempt connection with retries
    this.connectWithRetry()

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
    phaserEvents.on(Event.PLAYER_DISCONNECTED, this.playerStreamDisconnect, this)
  }

  /**
   * method to join Colyseus' built-in LobbyRoom, which automatically notifies
   * connected clients whenever rooms with "realtime listing" have updates
   */
  async joinLobbyRoom() {
    try {
      console.log('Attempting to join lobby room...');
      this.connectionStatus = ConnectionStatus.CONNECTING;
      
      this.lobby = await this.client.joinOrCreate(RoomType.LOBBY);
      console.log('Successfully joined lobby');
      
      // Set up lobby room event handlers
      this.lobby.onStateChange(() => {
        console.log('Lobby state updated');
        this.connectionStatus = ConnectionStatus.CONNECTED;
      });

      this.lobby.onError((error) => {
        console.error('Lobby room error:', error);
        this.connectionStatus = ConnectionStatus.ERROR;
        this.scheduleReconnect();
      });

      this.lobby.onLeave((code) => {
        console.log('Left lobby room, code:', code);
        this.connectionStatus = ConnectionStatus.DISCONNECTED;
        this.scheduleReconnect();
      });

      // Set up room listing handlers
      this.lobby.onMessage('rooms', (rooms) => {
        console.log('Received rooms list:', rooms);
        store.dispatch(setAvailableRooms(rooms));
      });

      this.lobby.onMessage('+', ([roomId, room]) => {
        console.log('Room added:', roomId);
        store.dispatch(addAvailableRooms({ roomId, room }));
      });

      this.lobby.onMessage('-', (roomId) => {
        console.log('Room removed:', roomId);
        store.dispatch(removeAvailableRooms(roomId));
      });
    } catch (error) {
      console.error('Failed to join lobby:', error);
      this.connectionStatus = ConnectionStatus.ERROR;
      this.scheduleReconnect();
      throw error;
    }
  }

  // method to join the public lobby
  async joinOrCreatePublic() {
    try {
      console.log('Attempting to join public room...');
      this.lastRoomType = RoomType.PUBLIC;
      this.lastRoomData = null;
      
      this.room = await this.client.joinOrCreate(RoomType.PUBLIC);
      console.log('Successfully joined/created public room:', this.room.id);
      
      // Set up room event handlers
      this.room.onStateChange((state) => {
        console.log('Room state updated:', {
          numPlayers: state.players.size,
          playerIds: Array.from(state.players.keys())
        });
      });

      this.room.onError((error) => {
        console.error('Room error:', error);
        this.scheduleReconnect();
      });

      this.room.onLeave((code) => {
        console.log('Left room, code:', code);
        if (code > 1000) { // Abnormal closure
          this.scheduleReconnect();
        }
      });

      await this.initialize();
      console.log('Room initialized successfully');
    } catch (error) {
      console.error('Failed to join public room:', error);
      await this.retryRoomConnection(() => this.client.joinOrCreate(RoomType.PUBLIC));
    }
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    try {
      this.lastRoomType = RoomType.CUSTOM;
      this.lastRoomData = { roomId, password };
      this.room = await this.client.joinById(roomId, { password });
      await this.initialize();
    } catch (error) {
      console.error('Failed to join custom room:', error);
      await this.retryRoomConnection(() => this.client.joinById(roomId, { password }));
      console.error('Failed to join room:', error)
      await this.retryRoomConnection(() => this.client.joinById(roomId, { password }))
    }
  }

  // method to create a custom room
  async createCustom(roomData: IRoomData) {
    const { name, description, password, autoDispose } = roomData
    try {
      this.lastRoomType = RoomType.CUSTOM
      this.lastRoomData = roomData
      this.room = await this.client.create(RoomType.CUSTOM, {
        name,
        description,
        password,
        autoDispose,
      })
      this.initialize()
    } catch (error) {
      console.error('Failed to create room:', error)
      await this.retryRoomConnection(() => 
        this.client.create(RoomType.CUSTOM, {
          name,
          description,
          password,
          autoDispose,
        })
      )
    }
  }

  // helper method to retry room connections
  private async retryRoomConnection(connectFn: () => Promise<Room<IOfficeState>>, attempt: number = 1) {
    if (attempt > this.maxRetries) {
      throw new Error('Failed to connect to room after multiple attempts')
    }

    try {
      const delay = Math.min(this.retryDelay * Math.pow(2, attempt - 1), 10000)
      await new Promise(resolve => setTimeout(resolve, delay))
      this.room = await connectFn()
      this.initialize()
    } catch (error) {
      console.warn(`Room connection attempt ${attempt}/${this.maxRetries} failed:`, error)
      await this.retryRoomConnection(connectFn, attempt + 1)
    }
  }

  // set up all network listeners before the game starts
  async initialize() {
    if (!this.room || this.connecting || this.disconnecting) return

    this.connecting = true
    this.ready = false

    try {
      this.mySessionId = this.room.sessionId
      store.dispatch(setSessionId(this.room.sessionId))

      // Setup reconnection handling
      this.room.onLeave((code) => {
        console.log('Left room:', code)
        this.ready = false
        this.disconnecting = false
        if (code > 1000 && !this.connecting) {
          console.log('Attempting to reconnect...')
          this.attemptReconnection()
        }
      })

      // Wait for room state to be fully initialized
      await new Promise<void>((resolve) => {
        this.room?.onStateChange.once(() => {
          console.log("Room state initialized:", this.room?.state)
          this.webRTC = new WebRTC(this.mySessionId, this)
          this.setupStateListeners()
          this.ready = true
          this.connecting = false
          resolve()
        })
      })
    } catch (error) {
      console.error('Failed to initialize room:', error)
      this.connecting = false
      this.ready = false
      throw error
    }

    // Wait for room state to be fully initialized
    await new Promise<void>((resolve) => {
      this.room?.onStateChange.once(() => {
        console.log("Room state initialized:", this.room?.state)
        this.webRTC = new WebRTC(this.mySessionId, this)
        this.setupStateListeners()
        resolve()
      })
    })
  }

  private setupStateListeners = () => {
    if (!this.room || !this.room.state) return

    // new instance added to the players MapSchema
    this.room.state.players.onAdd = (player: IPlayer, key: string) => {
      if (key === this.mySessionId) return

      // track changes on every child object inside the players MapSchema
      player.onChange = (changes) => {
        changes.forEach((change) => {
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

          // when a new player finished setting up player name
          if (field === 'name' && value !== '') {
            phaserEvents.emit(Event.PLAYER_JOINED, player, key)
            store.dispatch(setPlayerNameMap({ id: key, name: value }))
            store.dispatch(pushPlayerJoinedMessage(value))
          }
        })
      }
    }

    // an instance removed from the players MapSchema
    this.room.state.players.onRemove = (player: IPlayer, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      this.webRTC?.deleteVideoStream(key)
      this.webRTC?.deleteOnCalledVideoStream(key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
    }

    // new instance added to the computers MapSchema
    this.room.state.computers.onAdd = (computer: IComputer, key: string) => {
      // track changes on every child object's connectedUser
      computer.connectedUser.onAdd = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.COMPUTER)
      }
      computer.connectedUser.onRemove = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.COMPUTER)
      }
    }

    // new instance added to the whiteboards MapSchema
    this.room.state.whiteboards.onAdd = (whiteboard: IWhiteboard, key: string) => {
      store.dispatch(
        setWhiteboardUrls({
          whiteboardId: key,
          roomId: whiteboard.roomId,
        })
      )
      // track changes on every child object's connectedUser
      whiteboard.connectedUser.onAdd = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.WHITEBOARD)
      }
      whiteboard.connectedUser.onRemove = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.WHITEBOARD)
      }
    }

    // new instance added to the chatMessages ArraySchema
    this.room.state.chatMessages.onAdd = (item, index) => {
      store.dispatch(pushChatMessage(item))
    }

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
    if (!this.ready || !this.room || this.connecting || this.disconnecting) return
    try {
      this.room.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
    } catch (error) {
      console.warn('Failed to send player update:', error)
    }
  }

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    if (!this.ready || !this.room || this.connecting || this.disconnecting) return
    try {
      this.room.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
    } catch (error) {
      console.warn('Failed to send player name update:', error)
    }
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    if (!this.ready || !this.room || this.connecting || this.disconnecting) return
    try {
      this.room.send(Message.READY_TO_CONNECT)
      phaserEvents.emit(Event.MY_PLAYER_READY)
    } catch (error) {
      console.warn('Failed to send ready to connect signal:', error)
    }
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

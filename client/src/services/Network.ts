import { Client, Room } from 'colyseus.js'
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
  private room?: Room
  private lobby!: Room
  webRTC?: WebRTC
  mySessionId!: string

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')
    const endpoint = process.env.NODE_ENV === 'production'
      ? import.meta.env.VITE_SERVER_URL
      : protocol + '//' + window.location.hostname + ':8080'
    this.client = new Client(endpoint)
    this.joinLobbyRoom().then(() => {
      store.dispatch(setLobbyJoined(true))
    })
    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
    phaserEvents.on(Event.PLAYER_DISCONNECTED, this.playerStreamDisconnect, this)
  }

  async joinLobbyRoom() {
    try {
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
    } catch (error) {
      console.error('Failed to join lobby:', error)
    }
  }

  async joinOrCreatePublic() {
    try {
      this.room = await this.client.joinOrCreate('SkyOffice')
      return this.room
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async joinCustomById(roomId: string, password: string | null) {
    try {
      this.room = await this.client.joinById(roomId, { password })
      return this.room
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async createCustom(roomData: IRoomData) {
    try {
      this.room = await this.client.create('SkyOffice', roomData)
      return this.room
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  initialize() {
    if (!this.room) return
    this.lobby.leave()
    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))
    this.webRTC = new WebRTC(this.mySessionId, this)

    this.room.state.players.onAdd = (player: any, key: string) => {
      if (key === this.mySessionId) return
      player.onChange = (changes: any) => {
        changes.forEach((change: any) => {
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)
          if (field === 'name' && value !== '') {
            phaserEvents.emit(Event.PLAYER_JOINED, player, key)
            store.dispatch(setPlayerNameMap({ id: key, name: value }))
            store.dispatch(pushPlayerJoinedMessage(value))
          }
        })
      }
    }

    this.room.state.players.onRemove = (player: any, key: string) => {
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      this.webRTC?.deleteVideoStream(key)
      this.webRTC?.deleteOnCalledVideoStream(key)
      store.dispatch(pushPlayerLeftMessage(player.name))
      store.dispatch(removePlayerNameMap(key))
    }

    this.room.state.computers.onAdd = (computer: any, key: string) => {
      computer.connectedUser.onAdd = (item: any, index: any) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.COMPUTER)
      }
      computer.connectedUser.onRemove = (item: any, index: any) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.COMPUTER)
      }
    }

    this.room.state.whiteboards.onAdd = (whiteboard: any, key: string) => {
      whiteboard.connectedUser.onAdd = (item: any, index: any) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.WHITEBOARD)
      }
      whiteboard.connectedUser.onRemove = (item: any, index: any) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.WHITEBOARD)
      }
    }

    this.room.state.chatMessages.onAdd = (item: any, index: any) => {
      phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, item.author, item.content)
      store.dispatch(pushChatMessage(item))
    }

    this.room.onMessage(Message.SEND_ROOM_DATA, (message: any) => {
      store.dispatch(setJoinedRoomData(message))
    })
    this.room.onMessage('computer_update', (message: any) => {
      store.dispatch(setWhiteboardUrls(message))
    })
    this.room.onMessage('whiteboard_update', (message: any) => {
      store.dispatch(setWhiteboardUrls(message))
    })
    this.room.onMessage(Message.DISCONNECT_STREAM, (message: any) => {
      this.webRTC?.deleteVideoStream(message.clientId)
    })
    this.room.onMessage(Message.STOP_SCREEN_SHARE, (message: any) => {
      this.webRTC?.deleteOnCalledVideoStream(message.clientId)
    })
  }

  onPlayerJoined(callback: (player: any, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)
  }

  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
  }

  onMyPlayerVideoConnected(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_VIDEO_CONNECTED, callback, context)
  }

  onPlayerUpdated(callback: (field: string, value: number | string, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  onItemUserAdded(callback: (userId: string, itemId: string, itemType: ItemType) => void, context?: any) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)
  }

  onItemUserRemoved(callback: (userId: string, itemId: string, itemType: ItemType) => void, context?: any) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }

  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
  }

  readyToConnect() {
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  videoConnected() {
    this.room?.send(Message.VIDEO_CONNECTED)
    phaserEvents.emit(Event.MY_PLAYER_VIDEO_CONNECTED)
  }

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
    this.room?.send(Message.STOP_SCREEN_SHARE, { clientId: id })
  }

  addChatMessage(content: string) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content })
  }
}

import bcrypt from 'bcrypt'
import { Room, Client } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard } from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { IRoomData } from '../../types/Rooms'
import { whiteboardRoomIds } from './schema/OfficeState'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  ComputerAddUserCommand,
  ComputerRemoveUserCommand,
} from './commands/ComputerUpdateArrayCommand'
import {
  WhiteboardAddUserCommand,
  WhiteboardRemoveUserCommand,
} from './commands/WhiteboardUpdateArrayCommand'
import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'

export class MetaDeskPublic extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  maxClients = 16

  async onCreate(options: any = {}): Promise<void> {
    console.log(`🏢 MetaDeskPublic room created: ${this.roomId} - VERSION 2.0 NO RESERVATIONS`);
    
    // 🚨 NUCLEAR OPTION: Multiple layers of reservation disabling
    console.log(`🚨 ENFORCING ZERO SEAT RESERVATIONS - NUCLEAR OPTION ACTIVATED!`);
    this.setSeatReservationTime(0); // Disable seat reservations entirely
    
    // Additional safety: Check global environment
    if (process.env.DISABLE_SEAT_RESERVATIONS === 'true') {
      console.log(`✅ Global environment confirms: NO SEAT RESERVATIONS`);
    }
    
    this.setPrivate(false);
    this.setMetadata({ name: "Public Lobby", description: "Open workspace", hasPassword: false });
    this.setState(new OfficeState());

    // Add computers and whiteboards
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    for (let i = 0; i < 3; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

    // Set up message handlers
    this.setupMessageHandlers();
  }

  private setupMessageHandlers() {
    this.onMessage(Message.UPDATE_PLAYER, (client, message) => {
      this.dispatcher.dispatch(new PlayerUpdateCommand(), {
        client,
        x: message.x,
        y: message.y,
        anim: message.anim,
      })
    })

    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message) => {
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
    })

    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) {
        player.readyToConnect = true
      }
    })

    this.onMessage(Message.VIDEO_CONNECTED, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) {
        player.videoConnected = true
      }
    })

    this.onMessage(Message.DISCONNECT_STREAM, (client, message) => {
      const player = this.state.players.get(message.clientId)
      if (player) {
        player.videoConnected = false
      }
    })

    this.onMessage(Message.CONNECT_TO_COMPUTER, (client, message) => {
      this.dispatcher.dispatch(new ComputerAddUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    this.onMessage(Message.DISCONNECT_FROM_COMPUTER, (client, message) => {
      this.dispatcher.dispatch(new ComputerRemoveUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    this.onMessage(Message.CONNECT_TO_WHITEBOARD, (client, message) => {
      this.dispatcher.dispatch(new WhiteboardAddUserCommand(), {
        client,
        whiteboardId: message.whiteboardId,
      })
    })

    this.onMessage(Message.DISCONNECT_FROM_WHITEBOARD, (client, message) => {
      this.dispatcher.dispatch(new WhiteboardRemoveUserCommand(), {
        client,
        whiteboardId: message.whiteboardId,
      })
    })

    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: any) => {
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content || message,
      })
    })
  }

  // NO AUTH REQUIRED - public room
  async onAuth(client: Client, options: any): Promise<boolean> {
    console.log(`✅ Public access granted to client ${client.sessionId}`)
    return true
  }

  // NO RESERVATIONS - direct join with triple safety check
  onJoin(client: Client, options: any): void {
    console.log(`🚪 Client ${client.sessionId} joined public room ${this.roomId}`)
    
    // 🚨 EMERGENCY: Force zero reservations again in case of system override
    this.setSeatReservationTime(0);
    console.log(`🚨 EMERGENCY: Seat reservations re-disabled in onJoin for ${client.sessionId}`);
    
    try {
      client.send(Message.SEND_ROOM_DATA, {
        roomId: this.roomId,
        name: "Public Lobby",
        description: "Open workspace for everyone",
      })
      
      const player = new Player();
      this.state.players.set(client.sessionId, player);
      console.log(`✅ Player added successfully. Total players: ${this.state.players.size}/${this.maxClients}`)
      console.log(`🔧 Room ${this.roomId} NO SEAT RESERVATIONS ENFORCED`)
    } catch (error) {
      console.error(`❌ Error in onJoin for client ${client.sessionId}:`, error)
    }
  }

  onLeave(client: Client, consented: boolean): void {
    console.log(`🚪 Client ${client.sessionId} left public room, consented: ${consented}`)
    
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
      console.log(`✅ Player removed. Total players: ${this.state.players.size}/${this.maxClients}`)
    }
  }

  onError(client: Client, error: any): void {
    console.error(`💥 Public room error for client ${client.sessionId}:`, error)
  }

  onDispose(): void {
    console.log(`🏢 Public room ${this.roomId} disposing...`)
  }
}
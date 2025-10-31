import { Room, Client } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard } from './schema/OfficeState'
import { Message } from '../../types/Messages'
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

export class InstantMetaDesk extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  maxClients = 16

  async onCreate(options: any = {}): Promise<void> {
    console.log(`🚀 InstantMetaDesk room created: ${this.roomId} - INSTANT JOIN NO RESERVATIONS`);
    
    // 🚨 INSTANT CONNECTION: No seat reservations whatsoever
    // Don't even call setSeatReservationTime - avoid the system entirely
    console.log(`⚡ INSTANT CONNECTION MODE: Bypassing ALL Colyseus reservation systems`);
    
    this.setPrivate(false);
    this.autoDispose = false;
    this.setMetadata({ 
      name: "Instant Lobby", 
      description: "Instant join workspace - zero wait time", 
      hasPassword: false,
      instant: true,
      reservations: "disabled"
    });

    this.setState(new OfficeState());

    // Add computers and whiteboards
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    for (let i = 0; i < 3; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

    this.setupMessageHandlers();
    console.log(`✅ InstantMetaDesk ${this.roomId} ready for INSTANT connections`);
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

  // INSTANT AUTH - always allow
  async onAuth(client: Client, options: any): Promise<boolean> {
    console.log(`⚡ INSTANT access granted to client ${client.sessionId}`)
    return true
  }

  // INSTANT JOIN - no reservations, no delays
  onJoin(client: Client, options: any): void {
    console.log(`⚡ INSTANT JOIN: Client ${client.sessionId} joined InstantMetaDesk ${this.roomId}`)
    
    try {
      // Send room data immediately
      client.send(Message.SEND_ROOM_DATA, {
        roomId: this.roomId,
        name: "Instant Lobby",
        description: "Zero-delay workspace",
      })
      
      // Create player immediately
      const player = new Player();
      this.state.players.set(client.sessionId, player);
      console.log(`⚡ INSTANT player added. Total: ${this.state.players.size}/${this.maxClients}`)
      
      // Send welcome message
      console.log(`🎉 Client ${client.sessionId} successfully joined InstantMetaDesk!`)
    } catch (error) {
      console.error(`❌ Error in InstantMetaDesk onJoin for client ${client.sessionId}:`, error)
    }
  }

  onLeave(client: Client, consented: boolean): void {
    console.log(`⚡ Client ${client.sessionId} left InstantMetaDesk, consented: ${consented}`)
    
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
      console.log(`⚡ Player removed. Total: ${this.state.players.size}/${this.maxClients}`)
    }
  }

  onDispose(): void {
    console.log(`⚡ InstantMetaDesk room ${this.roomId} disposing`)
  }
}
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

export class MetaDesk extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string = ''
  private description: string = ''
  private password: string | null = null
  maxClients = 16

  async onCreate(options: IRoomData): Promise<void> {
    const { name, description, password, autoDispose } = options;
    this.name = name;
    this.description = description;
    this.autoDispose = autoDispose;
    
    // 🚨 NUCLEAR OPTION: Check global environment override
    if (process.env.DISABLE_SEAT_RESERVATIONS === 'true') {
      console.log(`🚨 GLOBAL OVERRIDE: MetaDesk ${this.roomId} - ZERO seat reservations enforced`);
      this.setSeatReservationTime(0); // Force zero reservations
    } else {
      // EMERGENCY FIX: Disable seat reservations completely to solve connection issues
      this.setSeatReservationTime(0); // NO RESERVATIONS - immediate join
    }
    
    this.setPrivate(false); // Ensure room is discoverable
    
    console.log(`🏢 MetaDesk room created: ${this.roomId} - ${name} - NO RESERVATIONS MODE`);
    console.log(`⚡ Seat reservation time: 0 seconds (DISABLED)`);
    console.log(`👥 Max clients: ${this.maxClients}`);

    let hasPassword = false;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(password, salt);
      hasPassword = true;
      console.log(`🔒 Room has password protection`);
    }
    this.setMetadata({ name, description, hasPassword });
    this.setState(new OfficeState());

    // HARD-CODED: Add 5 computers in a room
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    // HARD-CODED: Add 3 whiteboards in a room
    for (let i = 0; i < 3; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

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

    this.onMessage(Message.STOP_SCREEN_SHARE, (client, message) => {
      const computer = this.state.computers.get(message.computerId)
      if (computer) {
        computer.connectedUser.forEach((id) => {
          const player = this.state.players.get(id)
          if (player) {
            player.videoConnected = false
          }
        })
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

    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message) => {
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })
    })
  }

  async onReserve(client: Client, options: any): Promise<any> {
    console.log(`🎫 Seat reservation request from client ${client.sessionId}`);
    console.log(`👥 Current players: ${this.clients.length}/${this.maxClients}`);
    
    // Always allow reservation if under max capacity - be very permissive
    if (this.clients.length < this.maxClients) {
      console.log(`✅ Seat reserved for client ${client.sessionId}`);
      return { reserved: true, timestamp: Date.now() };
    } else {
      console.log(`❌ Room is full, denying reservation for client ${client.sessionId}`);
      throw new Error(`Room is full (${this.maxClients} players maximum)`);
    }
  }

  async onAuth(client: Client, options: { password: string | null }): Promise<boolean> {
    console.log(`🔐 Authentication attempt for client ${client.sessionId}`);
    
    if (this.password) {
      if (!options.password) {
        console.log(`❌ Client ${client.sessionId} failed auth: no password provided`);
        return false
      }
      const validPassword = await bcrypt.compare(options.password, this.password)
      console.log(`${validPassword ? '✅' : '❌'} Client ${client.sessionId} auth result: ${validPassword}`)
      return validPassword
    }
    console.log(`✅ Client ${client.sessionId} auth successful: no password required`)
    return true
  }

  onJoin(client: Client, options: any): void {
    console.log(`🚪 Client ${client.sessionId} joined room ${this.roomId}`)
    console.log(`👤 Adding player for client ${client.sessionId}`)
    
    // 🚨 EMERGENCY: Force zero reservations again in case of system override
    this.setSeatReservationTime(0);
    console.log(`🚨 EMERGENCY: Seat reservations re-disabled in onJoin for ${client.sessionId}`);
    
    try {
      client.send(Message.SEND_ROOM_DATA, {
        roomId: this.roomId,
        name: this.name,
        description: this.description,
      })
      
      const player = new Player();
      this.state.players.set(client.sessionId, player);
      console.log(`✅ Player added successfully. Total players: ${this.state.players.size}`)
      console.log(`🔧 Room ${this.roomId} NO SEAT RESERVATIONS ENFORCED`)
    } catch (error) {
      console.error(`❌ Error in onJoin for client ${client.sessionId}:`, error)
      // Don't throw here, try to continue
    }
  }

  onLeave(client: Client, consented: boolean): void {
    console.log(`🚪 Client ${client.sessionId} left room ${this.roomId}, consented: ${consented}`)
    
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
      console.log(`✅ Player removed for client ${client.sessionId}. Total players: ${this.state.players.size}`)
    } else {
      console.log(`⚠️ Client ${client.sessionId} was not found in players list`)
    }
  }

  onError(client: Client, error: any): void {
    console.error(`💥 Error for client ${client.sessionId} in room ${this.roomId}:`, error)
    
    // Try to gracefully handle seat reservation errors
    if (error && error.message && error.message.includes('seat reservation')) {
      console.log(`🔄 Attempting to recover from seat reservation error for ${client.sessionId}`)
      // Allow a brief moment for the client to retry
    }
  }

  onDispose(): void {
    console.log('room', this.roomId, 'disposing...')
  }
}
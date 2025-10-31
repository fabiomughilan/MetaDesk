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
    this.setSeatReservationTime(15);

    let hasPassword = false;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(password, salt);
      hasPassword = true;
    }
    this.setMetadata({ name, description, hasPassword });
    this.setState(new OfficeState());

    this.setState(new OfficeState())

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

  async onAuth(client: Client, options: { password: string | null }): Promise<boolean> {
    if (this.password) {
      if (!options.password) {
        return false
      }
      const validPassword = await bcrypt.compare(options.password, this.password)
      return validPassword
    }
    return true
  }

  onJoin(client: Client, options: any): void {
    client.send(Message.SEND_ROOM_DATA, {
      roomId: this.roomId,
      name: this.name,
      description: this.description,
    })
    this.state.players.set(client.sessionId, new Player())
  }

  onLeave(client: Client, consented: boolean): void {
    if (this.state.players.has(client.sessionId)) {
      this.state.players.delete(client.sessionId)
    }
  }

  onDispose(): void {
    console.log('room', this.roomId, 'disposing...')
  }
}
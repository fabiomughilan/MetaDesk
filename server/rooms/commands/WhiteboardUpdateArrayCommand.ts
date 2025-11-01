import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { SkyOffice } from '../SkyOffice'

type Payload = {
  client: Client
  whiteboardId: string
}

export class WhiteboardAddUserCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, whiteboardId } = data
    const whiteboard = this.room.state.whiteboards.get(whiteboardId)
    const clientId = client.sessionId

    if (!whiteboard || whiteboard.connectedUser.has(clientId)) return
    whiteboard.connectedUser.add(clientId)
  }
}

export class WhiteboardRemoveUserCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, whiteboardId } = data
    const whiteboard = this.room.state.whiteboards.get(whiteboardId)

    if (!whiteboard) return
    if (whiteboard.connectedUser.has(client.sessionId)) {
      whiteboard.connectedUser.delete(client.sessionId)
    }
  }
}

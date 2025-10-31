import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { MetaDesk } from '../MetaDesk'

type Payload = {
  client: Client
  x: number
  y: number
  anim: string
}

export default class PlayerUpdateCommand extends Command<MetaDesk, Payload> {
  execute(data: Payload) {
    const { client, x, y, anim } = data

    const player = this.room.state.players.get(client.sessionId)

    if (!player) return
    player.x = x
    player.y = y
    player.anim = anim
  }
}

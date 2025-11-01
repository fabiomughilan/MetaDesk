import { Command } from '@colyseus/command'
import { Client } from 'colyseus'
import { ChatMessage } from '../schema/OfficeState'
import { ArraySchema } from '@colyseus/schema'
import { SkyOffice } from '../SkyOffice'

type Payload = {
  client: Client
  content: string
}

export default class ChatMessageUpdateCommand extends Command<SkyOffice, Payload> {
  execute(data: Payload) {
    const { client, content } = data
    const player = this.room.state.players.get(client.sessionId)
    const chatMessages = this.room.state.chatMessages

    if (!chatMessages || !player) return

    /**
     * Only allow server to store a maximum of 100 chat messages:
     * remove the first element before pushing a new one when array length is >= 100
     */
    if (chatMessages.length >= 100) chatMessages.shift()

    const newMessage = new ChatMessage()
    newMessage.author = player.name
    newMessage.content = content
    newMessage.createdAt = new Date().getTime()
    chatMessages.push(newMessage)
  }
}

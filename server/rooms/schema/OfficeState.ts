import { Schema, ArraySchema, SetSchema, MapSchema } from '@colyseus/schema'
import { type } from '@colyseus/schema'
import type { IOfficeState, IPlayer, IComputer, IWhiteboard, IChatMessage } from '../../../types/IOfficeState'

// Whiteboard room ID management
const whiteboardRoomIds = new Set<string>()

function generateRoomId(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

function createUniqueRoomId(): string {
  const result = generateRoomId(12)
  if (!whiteboardRoomIds.has(result)) {
    whiteboardRoomIds.add(result)
    return result
  }
  console.log('roomId exists, remaking another one.')
  return createUniqueRoomId()
}

// Schema definitions
class Player extends Schema {
  @type('string') name = ''
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
  @type('boolean') readyToConnect = false
  @type('boolean') videoConnected = false
}

class Computer extends Schema {
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

class Whiteboard extends Schema {
  @type('string') roomId = createUniqueRoomId()
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

class ChatMessage extends Schema {
  @type('string') author = ''
  @type('number') createdAt = new Date().getTime()
  @type('string') content = ''
}

class OfficeState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>()
  @type({ map: Computer }) computers = new MapSchema<Computer>()
  @type({ map: Whiteboard }) whiteboards = new MapSchema<Whiteboard>()
  @type([ChatMessage]) chatMessages = new ArraySchema<ChatMessage>()
}

export { whiteboardRoomIds, Player, Computer, Whiteboard, ChatMessage, OfficeState }
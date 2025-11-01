import { Schema, ArraySchema, SetSchema, MapSchema, type } from '@colyseus/schema'

export const whiteboardRoomIds = new Set<string>()
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function getRoomId(): string {
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  if (!whiteboardRoomIds.has(result)) {
    whiteboardRoomIds.add(result)
    return result
  } else {
    console.log('roomId exists, remaking another one.')
    return getRoomId()
  }
}

export class Player extends Schema {
  @type('string') name: string = ''
  @type('number') x: number = 700 + Math.floor(Math.random() * 200) // Random spawn 700-900
  @type('number') y: number = 450 + Math.floor(Math.random() * 100) // Random spawn 450-550
  @type('string') anim: string = 'adam_idle_down'
  @type('boolean') readyToConnect: boolean = false
  @type('boolean') videoConnected: boolean = false
}

export class Computer extends Schema {
  @type({ set: 'string' }) connectedUser: SetSchema<string> = new SetSchema<string>()
}

export class Whiteboard extends Schema {
  @type('string') roomId: string = getRoomId()
  @type({ set: 'string' }) connectedUser: SetSchema<string> = new SetSchema<string>()
}

export class ChatMessage extends Schema {
  @type('string') author: string = ''
  @type('number') createdAt: number = new Date().getTime()
  @type('string') content: string = ''
}

export class OfficeState extends Schema {
  @type({ map: Player })
  players: MapSchema<Player> = new MapSchema<Player>()

  @type({ map: Computer })
  computers: MapSchema<Computer> = new MapSchema<Computer>()

  @type({ map: Whiteboard })
  whiteboards: MapSchema<Whiteboard> = new MapSchema<Whiteboard>()

  @type([ChatMessage])
  chatMessages: ArraySchema<ChatMessage> = new ArraySchema<ChatMessage>()
}
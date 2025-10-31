export enum RoomType {
  LOBBY = 'lobby',
  PUBLIC = 'InstantMetaDesk',
  INSTANT = 'InstantMetaDesk',
  CUSTOM = 'custom',
}

export interface IRoomData {
  name: string
  description: string
  password: string | null
  autoDispose: boolean
}

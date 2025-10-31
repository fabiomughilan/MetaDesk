import { Schema, ArraySchema, SetSchema, MapSchema } from '@colyseus/schema'

// Interfaces for each schema type
export interface IPlayer extends Schema {
  name: string;
  x: number;
  y: number;
  anim: string;
  readyToConnect: boolean;
  videoConnected: boolean;
  onChange?: (changes: Array<any>) => void;
}

export interface IComputer {
  connectedUser: SetSchema<string>;
}

export interface IWhiteboard {
  roomId: string;
  connectedUser: SetSchema<string>;
}

export interface IChatMessage {
  author: string;
  createdAt: number;
  content: string;
}

// Interface for the root state
export interface IOfficeState extends Schema {
  players: MapSchema<IPlayer>;
  computers: MapSchema<IComputer>;
  whiteboards: MapSchema<IWhiteboard>;
  chatMessages: ArraySchema<IChatMessage>;
}

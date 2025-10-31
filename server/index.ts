import http from 'http'
import express from 'express'
import cors from 'cors'
import { Server, LobbyRoom, Client } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { monitor } from '@colyseus/monitor'
import { RoomType } from '../types/Rooms'

// import socialRoutes from "@colyseus/social/express"

import { MetaDesk } from './rooms/MetaDesk'
import { MetaDeskPublic } from './rooms/MetaDeskPublic'

const port = Number(process.env.PORT || 8080)
const app = express()

// Enable CORS with proper configuration
const corsConfig = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://workdesk24.netlify.app']
    : true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsConfig));
app.use(express.json())
// app.use(express.static('dist'))

const server = http.createServer(app)

// 🚨 NUCLEAR OPTION: Set global environment to disable ALL seat reservations
process.env.DISABLE_SEAT_RESERVATIONS = 'true'
console.log('� GLOBAL OVERRIDE: All seat reservations DISABLED via environment!')

const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 5000,
    pingMaxRetries: 3,
  })
})

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, MetaDeskPublic, {
  name: 'Public Lobby (No Reservations)',
  description: 'Fast join workspace - no seat reservations',
  password: null,
  autoDispose: false,
})
gameServer.define(RoomType.CUSTOM, MetaDesk).enableRealtimeListing()

/**
 * Register @colyseus/social routes
 *
 * - uncomment if you want to use default authentication (https://docs.colyseus.io/server/authentication/)
 * - also uncomment the import statement
 */
// app.use("/", socialRoutes);

// register colyseus monitor AFTER registering your room handlers
app.use('/colyseus', monitor())

gameServer.listen(port)
console.log(`Listening on ws://localhost:${port}`)

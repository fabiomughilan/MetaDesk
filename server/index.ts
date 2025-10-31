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
import { InstantMetaDesk } from './rooms/InstantMetaDesk'

const port = Number(process.env.PORT || 8080)
const app = express()

// Enable CORS with proper configuration
const corsConfig = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://workdesk24.netlify.app', 'https://metadesk.netlify.app']
    : true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsConfig));
app.use(express.json())

// Health check endpoint for deployment verification
app.get('/', (req, res) => {
  res.json({ 
    status: 'MetaDesk Server Running',
    timestamp: new Date().toISOString(),
    port: port,
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', server: 'metadesk-colyseus' });
});

// app.use(express.static('dist'))

const server = http.createServer(app)

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
  description: 'Public workspace',
  password: null,
  autoDispose: false,
})
gameServer.define(RoomType.INSTANT, InstantMetaDesk, {
  name: 'Instant Lobby',
  description: 'Instant join workspace',
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
console.log(`🚀 MetaDesk Server started successfully!`)
console.log(`📡 WebSocket server listening on port ${port}`)
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`)
console.log(`🏥 Health check: http://localhost:${port}/health`)
console.log(`📊 Monitor: http://localhost:${port}/colyseus`)

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...')
  process.exit(0)
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...')
  process.exit(0)
});

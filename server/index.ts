import http from 'http'
import express from 'express'
import cors from 'cors'
import { Server, LobbyRoom } from 'colyseus'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { monitor } from '@colyseus/monitor'
import { RoomType } from '../types/Rooms'

// import socialRoutes from "@colyseus/social/express"

import { SkyOffice } from './rooms/SkyOffice'

const port = Number(process.env.PORT || 8080)
const app = express()

const allowedOrigins = [
  'https://workdesk24.netlify.app',
  'https://workdesk26.netlify.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      console.warn(`CORS blocked origin: ${origin}`)
      callback(null, true) // Allow for now, can change to false later
    }
  },
  credentials: true,
}))
app.use(express.json())
app.use(express.static('dist'))

const server = http.createServer(app)
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 30000,
    pingMaxRetries: 3,
  }),
})

// register room handlers
gameServer.define(RoomType.LOBBY, LobbyRoom)
gameServer.define(RoomType.PUBLIC, SkyOffice, {
  name: 'Public Lobby',
  description: 'For making friends and familiarizing yourself with the controls',
  password: null,
  autoDispose: false,
})
gameServer.define(RoomType.CUSTOM, SkyOffice).enableRealtimeListing()

// Configure CORS for Colyseus matchmaker endpoints
gameServer.onShutdown(function() {
  console.log('Server shutting down...')
})

// Override CORS headers for Colyseus matchmaker
const matchMaker = (gameServer as any).matchMaker
if (matchMaker && matchMaker.controller) {
  const originalGetCorsHeaders = matchMaker.controller.getCorsHeaders.bind(matchMaker.controller)
  matchMaker.controller.getCorsHeaders = function(req: any) {
    const origin = req.headers.origin || req.headers.referer
    
    // Check if origin is allowed
    const isAllowed = !origin || allowedOrigins.some(allowed => origin.includes(allowed.replace('https://', '').replace('http://', '')))
    
    return {
      'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    }
  }
}

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
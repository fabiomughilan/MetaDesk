import React, { useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
`

const Wrapper = styled.div`
  background: rgba(0, 0, 0, 0.85);
  padding: 32px;
  border-radius: 16px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 300px;

  .MuiAlert-root {
    margin-bottom: 16px;
  }

  .MuiButton-root {
    font-size: 1.2em;
    padding: 12px;
  }
`

export default function VideoConnectionDialog() {
  const [connectionWarning, setConnectionWarning] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connectWebcam = async () => {
    setIsConnecting(true)
    setError(null)
    try {
      console.log('Attempting to connect webcam...')
      const game = phaserGame.scene.keys.game as Game
      if (!game?.network) {
        console.log('Game not initialized, trying bootstrap scene...')
        const bootstrap = phaserGame.scene.keys.bootstrap as any
        if (bootstrap?.network?.webRTC) {
          await bootstrap.network.webRTC.getUserMedia()
        } else {
          throw new Error('Network not initialized')
        }
      } else {
        if (!game.network.webRTC) {
          throw new Error('WebRTC not initialized')
        }
        await game.network.webRTC.getUserMedia()
      }
    } catch (err) {
      console.error('Error connecting webcam:', err)
      setError(err instanceof Error ? err.message : 'Failed to connect webcam')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <Backdrop>
      <Wrapper>
        {connectionWarning && (
          <Alert
            severity="warning"
            onClose={() => {
              setConnectionWarning(!connectionWarning)
            }}
          >
            <AlertTitle>Warning</AlertTitle>
            No webcam connected
            <br /> <strong>connect one for full experience!</strong>
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            <AlertTitle>Error</AlertTitle>
            {error}
          </Alert>
        )}
        <Button
          variant="contained"
          color="secondary"
          onClick={connectWebcam}
          disabled={isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Connect Webcam'}
        </Button>
      </Wrapper>
    </Backdrop>
  )
}

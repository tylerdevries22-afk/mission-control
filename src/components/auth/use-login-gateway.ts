'use client'

import { useEffect, useState } from 'react'
import { STORAGE_GATEWAY_URL } from '@/lib/device-identity'

const GATEWAY_URL_PRESETS = [
  'ws://127.0.0.1:18789',
  'wss://127.0.0.1:18789',
  'ws://localhost:18789',
  'wss://localhost:18789',
  'wss://gateway:18789',
]

const GATEWAY_CONNECTION_TIMEOUT_MS = 5000

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'failed'

export function useLoginGateway() {
  // Advanced settings state
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [gatewayPreset, setGatewayPreset] = useState<string>(() => {
    // Auto-select wss:// preset when the page is served over HTTPS (reverse proxy)
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return 'wss://127.0.0.1:18789'
    }
    return 'ws://127.0.0.1:18789'
  })
  const [gatewayCustom, setGatewayCustom] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [connectionError, setConnectionError] = useState('')

  // Initialize gateway URL from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_GATEWAY_URL)
    if (saved) {
      if (GATEWAY_URL_PRESETS.includes(saved)) {
        setGatewayPreset(saved)
      } else {
        setGatewayPreset('custom')
        setGatewayCustom(saved)
      }
    }
  }, [])

  const getEffectiveGatewayUrl = (): string => {
    return gatewayPreset === 'custom' ? gatewayCustom.trim() : gatewayPreset
  }

  const handleGatewayUrlChange = (value: string) => {
    setGatewayPreset(value)
    if (value !== 'custom') {
      localStorage.setItem(STORAGE_GATEWAY_URL, value)
      setConnectionStatus('idle')
    }
  }

  const handleGatewayCustomChange = (value: string) => {
    setGatewayCustom(value)
    const trimmed = value.trim()
    if (trimmed) {
      localStorage.setItem(STORAGE_GATEWAY_URL, trimmed)
      setConnectionStatus('idle')
    }
  }

  const handleTestConnection = () => {
    const url = getEffectiveGatewayUrl()
    if (!url) return
    setConnectionStatus('testing')
    setConnectionError('')

    return new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(url)
        const timeout = setTimeout(() => {
          ws.close()
          setConnectionStatus('failed')
          setConnectionError('Connection timed out')
          resolve()
        }, GATEWAY_CONNECTION_TIMEOUT_MS)

        ws.onopen = () => {
          clearTimeout(timeout)
          ws.close()
          setConnectionStatus('success')
          resolve()
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          ws.close()
          setConnectionStatus('failed')
          setConnectionError('Could not connect')
          resolve()
        }
      } catch {
        setConnectionStatus('failed')
        setConnectionError('Invalid URL')
        resolve()
      }
    })
  }

  return { advancedOpen, setAdvancedOpen, gatewayPreset, gatewayCustom, connectionStatus, connectionError,
    getEffectiveGatewayUrl, handleGatewayUrlChange, handleGatewayCustomChange, handleTestConnection }
}

export { GATEWAY_URL_PRESETS }

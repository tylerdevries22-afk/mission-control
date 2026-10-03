'use client'

import { useMissionControl } from '@/store'
import { buildGatewayWebSocketUrl } from '@/lib/gateway-url'
import { decodeGatewayFrame } from '@/lib/websocket-frame'
import { handleGatewayFrame } from '@/lib/websocket-handler'
import { sendConnectHandshake } from '@/lib/websocket-handshake'
import { reportSocketError } from '@/lib/websocket-errors'
import { scheduleGatewayReconnect } from '@/lib/websocket-reconnect'
import { addSocketLog, clearHandshakeTimers, socketHeartbeat, socketLog, socketState } from '@/lib/websocket-state'

function clearReconnectTimer() {
  if (socketState.reconnectTimer !== undefined) clearTimeout(socketState.reconnectTimer)
  socketState.reconnectTimer = undefined
}

export function connectGateway(url: string, token?: string) {
  if (socketState.ws?.readyState === WebSocket.OPEN || socketState.ws?.readyState === WebSocket.CONNECTING) return
  clearReconnectTimer()
  clearHandshakeTimers()
  socketHeartbeat.stop()
  try {
    const input = new URL(url, window.location.origin)
    socketState.token = token || input.searchParams.get('token') || ''
    const normalized = new URL(buildGatewayWebSocketUrl({ host: url,
      port: Number(process.env.NEXT_PUBLIC_GATEWAY_PORT || '18789'), browserProtocol: window.location.protocol }), window.location.origin)
    if (!['ws:', 'wss:'].includes(normalized.protocol) || normalized.username || normalized.password) throw new Error('Invalid gateway URL')
    // Authentication goes in the handshake, never in URLs, logs or connection state.
    normalized.search = normalized.hash = ''
    const target = normalized.toString().replace(/\/$/, '')
    if (socketState.url !== target) socketState.pathFallbackTried.clear()
    socketState.url = target
    socketState.handshakeComplete = socketState.connectSent = socketState.manualDisconnect = false
    socketState.connectId = socketState.nonRetryableError = socketState.lastSeq = null
    socketState.handshakeAttempt += 1
    const ws = new WebSocket(target)
    socketState.ws = ws
    ws.onopen = () => {
      if (socketState.ws !== ws) return
      socketLog.info(`Connected to ${target}`)
      useMissionControl.getState().setConnection({ url: target, reconnectAttempts: socketState.reconnectAttempts })
      socketState.handshakeTimer = setTimeout(() => {
        if (!socketState.handshakeComplete) void sendConnectHandshake(ws)
      }, 80)
      socketState.handshakeDeadline = setTimeout(() => {
        if (socketState.ws === ws && !socketState.handshakeComplete) ws.close(4000, 'Handshake timeout')
      }, 10_000)
    }
    ws.onmessage = event => {
      if (socketState.ws !== ws) return
      const frame = decodeGatewayFrame(event.data)
      if (!frame) { addSocketLog('debug', 'Ignored an invalid gateway message.'); return }
      handleGatewayFrame(frame, ws)
    }
    ws.onclose = event => {
      if (socketState.ws !== ws) return
      const wasConnected = socketState.handshakeComplete
      socketState.ws = null
      socketState.handshakeComplete = socketState.connectSent = false
      socketState.connectId = null
      socketState.handshakeAttempt += 1
      clearHandshakeTimers()
      socketHeartbeat.stop()
      useMissionControl.getState().setConnection({ isConnected: false })
      scheduleGatewayReconnect(target, event.code, wasConnected, connectGateway)
    }
    ws.onerror = () => {
      if (socketState.ws === ws && !socketState.nonRetryableError) reportSocketError('WebSocket error occurred')
    }
  } catch {
    reportSocketError('Failed to initialize WebSocket connection')
    useMissionControl.getState().setConnection({ isConnected: false })
  }
}

export function disconnectGateway() {
  socketState.manualDisconnect = true
  socketState.reconnectAttempts = 0
  socketState.pathFallbackTried.clear()
  socketState.handshakeAttempt += 1
  clearReconnectTimer()
  clearHandshakeTimers()
  socketHeartbeat.stop()
  const ws = socketState.ws
  socketState.ws = null
  socketState.handshakeComplete = socketState.connectSent = false
  socketState.connectId = null
  ws?.close(1000, 'Manual disconnect')
  useMissionControl.getState().setConnection({ isConnected: false, reconnectAttempts: 0, latency: undefined })
}

export function sendGatewayMessage(message: unknown): boolean {
  if (socketState.ws?.readyState !== WebSocket.OPEN || !socketState.handshakeComplete) return false
  try { socketState.ws.send(JSON.stringify(message)); return true }
  catch { reportSocketError('Failed to send gateway message'); return false }
}

export function reconnectGateway() {
  socketState.tokenOnlyFallback = socketState.tokenOnlyFallbackTried = false
  disconnectGateway()
  if (!socketState.url) return
  socketState.reconnectTimer = setTimeout(() => { connectGateway(socketState.url, socketState.token) }, 0)
}

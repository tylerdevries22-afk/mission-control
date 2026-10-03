import { useMissionControl } from '@/store'
import { clearDeviceIdentity } from '@/lib/device-identity'
import { NON_RETRYABLE_ERROR_CODES, readErrorDetailCode, shouldRetryWithoutDeviceIdentity } from '@/lib/websocket-utils'
import { addSocketLog, socketHeartbeat, socketLog, socketState } from '@/lib/websocket-state'
import type { GatewayFrame } from '@/lib/websocket-frame'

function errorHelp(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('origin not allowed')) {
    return `Gateway rejected browser origin. Add ${window.location.origin} to gateway.controlUi.allowedOrigins on the gateway, then reconnect.`
  }
  if (/device identity|secure context/.test(normalized)) {
    return 'Gateway requires device identity. Open Mission Control via HTTPS (or localhost), then reconnect so WebCrypto signing can run.'
  }
  if (normalized.includes('device_auth_signature_invalid')) return 'Gateway rejected device signature. Clear local device identity and reconnect.'
  if (/invalid connect params|\/client\/id/.test(normalized)) return 'Gateway rejected client identity params. Check the gateway client ID and reconnect.'
  if (/auth rate limit|rate limited/.test(normalized)) return 'Gateway authentication is rate limited. Wait briefly, then reconnect.'
  return 'Gateway handshake failed. Check gateway origin and device identity settings, then reconnect.'
}

export function handleGatewayConnectError(frame: GatewayFrame, ws: WebSocket) {
  const message = frame.error?.message?.slice(0, 2048) || 'Gateway handshake failed'
  if (shouldRetryWithoutDeviceIdentity(message, frame.error, Boolean(socketState.token), socketState.tokenOnlyFallbackTried)) {
    socketState.tokenOnlyFallback = socketState.tokenOnlyFallbackTried = true
    clearDeviceIdentity()
    addSocketLog('warn', 'Gateway rejected cached browser device credentials. Retrying with token-only authentication.')
    socketHeartbeat.stop()
    ws.close(4002, 'Retrying with token-only authentication')
    return
  }
  const code = readErrorDetailCode(frame.error)
  const nonRetryable = Boolean(code && NON_RETRYABLE_ERROR_CODES.has(code))
    || /origin not allowed|device identity required|requires device identity|secure context|device_auth_signature_invalid|invalid connect params|\/client\/id|auth rate limit|rate limited/i.test(message)
  const help = errorHelp(message)
  socketLog.error('Gateway handshake failed')
  addSocketLog('error', `Gateway error: ${message}${nonRetryable ? ` — ${help}` : ''}`)
  if (!nonRetryable) return
  socketState.nonRetryableError = message
  useMissionControl.getState().addNotification({
    id: Date.now(), recipient: 'operator', type: 'error', title: 'Gateway Handshake Blocked',
    message: help, created_at: Math.floor(Date.now() / 1000),
  })
  socketHeartbeat.stop()
  ws.close(4001, 'Non-retryable gateway handshake error')
}

export function reportSocketError(message: string) {
  const now = Date.now(), previous = socketState.lastError
  if (previous?.message === message && now - previous.at < 5000) return
  socketState.lastError = { message, at: now }
  addSocketLog('error', message)
}

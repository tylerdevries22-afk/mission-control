import { useMissionControl } from '@/store'
import { createClientLogger } from '@/lib/client-logger'
import { createGatewayHeartbeat } from '@/lib/websocket-heartbeat'

export const socketLog = createClientLogger('WebSocket')
export const socketState = {
  ws: null as WebSocket | null,
  reconnectTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  handshakeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  handshakeDeadline: undefined as ReturnType<typeof setTimeout> | undefined,
  url: '', token: '', requestId: 0, connectId: null as string | null,
  handshakeComplete: false, handshakeAttempt: 0, connectSent: false,
  reconnectAttempts: 0, manualDisconnect: false,
  nonRetryableError: null as string | null, lastSeq: null as number | null,
  tokenOnlyFallback: false, tokenOnlyFallbackTried: false,
  pathFallbackTried: new Set<string>(),
  lastError: null as { message: string; at: number } | null,
}

export function clearHandshakeTimers() {
  if (socketState.handshakeTimer !== undefined) clearTimeout(socketState.handshakeTimer)
  if (socketState.handshakeDeadline !== undefined) clearTimeout(socketState.handshakeDeadline)
  socketState.handshakeTimer = socketState.handshakeDeadline = undefined
}

export function addSocketLog(level: 'warn' | 'error' | 'debug', message: string) {
  const now = Date.now()
  useMissionControl.getState().addLog({
    id: `websocket-${now}-${++socketState.requestId}`, timestamp: now, level, source: 'websocket', message,
  })
}

export const socketHeartbeat = createGatewayHeartbeat({
  sendPing: id => {
    try { socketState.ws?.send(JSON.stringify({ type: 'req', method: 'ping', id })) }
    catch { socketState.ws?.close(4000, 'Heartbeat send failed') }
  },
  timeout: () => {
    addSocketLog('warn', 'Gateway heartbeat stopped; reconnecting.')
    socketState.ws?.close(4000, 'Heartbeat timeout')
  },
  latency: milliseconds => useMissionControl.getState().setConnection({ latency: milliseconds }),
})

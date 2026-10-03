import { useMissionControl } from '@/store'
import { cacheDeviceToken } from '@/lib/device-identity'
import { applyGatewayEvent } from '@/lib/websocket-events'
import { getGatewayHello, type GatewayFrame } from '@/lib/websocket-frame'
import { sendConnectHandshake } from '@/lib/websocket-handshake'
import { handleGatewayConnectError } from '@/lib/websocket-errors'
import { addSocketLog, clearHandshakeTimers, socketHeartbeat, socketLog, socketState } from '@/lib/websocket-state'
import { record, text } from '@/lib/websocket-value'

export function handleGatewayFrame(frame: GatewayFrame, ws: WebSocket) {
  if (socketState.ws !== ws) return
  if (frame.type === 'event' && frame.event === 'connect.challenge') {
    if (socketState.handshakeComplete) return
    if (socketState.handshakeTimer !== undefined) clearTimeout(socketState.handshakeTimer)
    socketState.handshakeTimer = undefined
    const nonce = text(record(frame.payload)?.nonce)
    if (nonce) void sendConnectHandshake(ws, nonce)
    return
  }
  if (!socketState.handshakeComplete) {
    if (frame.type !== 'res' || frame.id !== socketState.connectId) return
    if (!frame.ok) { handleGatewayConnectError(frame, ws); return }
    const hello = getGatewayHello(frame)
    clearHandshakeTimers()
    socketState.handshakeComplete = true
    socketState.reconnectAttempts = 0
    const deviceToken = text(record(hello.auth)?.deviceToken) || text(hello.deviceToken)
    if (deviceToken) {
      try { cacheDeviceToken(deviceToken) } catch { socketLog.warn('Device token cache unavailable') }
    }
    useMissionControl.getState().setConnection({ isConnected: true, lastConnected: new Date(), reconnectAttempts: 0 })
    socketHeartbeat.start(hello)
    return
  }
  if (socketHeartbeat.receive(frame.type === 'res' ? frame.id : undefined, frame.error)) return
  if (frame.type === 'res' && !frame.ok) {
    addSocketLog('error', `Gateway request failed: ${frame.error?.message?.slice(0, 2048) || 'Unknown error'}`)
    return
  }
  if (frame.type !== 'event') return
  if (frame.seq !== undefined) {
    if (socketState.lastSeq !== null && frame.seq > socketState.lastSeq + 1) {
      socketLog.warn(`Event sequence gap: expected ${socketState.lastSeq + 1}, received ${frame.seq}`)
    }
    socketState.lastSeq = frame.seq
  }
  applyGatewayEvent(frame)
}

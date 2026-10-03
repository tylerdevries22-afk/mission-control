import { useMissionControl } from '@/store'
import { buildGatewayPathFallbackUrls } from '@/lib/gateway-url'
import { calculateReconnectDelay } from '@/lib/websocket-utils'
import { addSocketLog, socketState } from '@/lib/websocket-state'

export function scheduleGatewayReconnect(url: string, code: number, wasConnected: boolean, connect: (url: string, token?: string) => void) {
  if (socketState.manualDisconnect) return
  const skipPathFallback = Boolean(socketState.nonRetryableError) || code === 4001 || code === 4002
  let target = socketState.url, delay = 0
  const fallback = !wasConnected && !skipPathFallback
    ? buildGatewayPathFallbackUrls(url).find(candidate => !socketState.pathFallbackTried.has(candidate)) : undefined
  if (fallback) {
    socketState.pathFallbackTried.add(fallback)
    target = socketState.url = fallback
    addSocketLog('warn', `Handshake failed on root path. Retrying WebSocket via ${new URL(fallback).pathname}.`)
  } else {
    if (socketState.nonRetryableError || process.env.NEXT_PUBLIC_GATEWAY_OPTIONAL === 'true') {
      useMissionControl.getState().setConnection({ reconnectAttempts: 0 })
      return
    }
    if (socketState.reconnectAttempts >= 10) {
      addSocketLog('error', 'Max reconnection attempts reached. Please reconnect manually.')
      return
    }
    delay = calculateReconnectDelay(socketState.reconnectAttempts++)
    useMissionControl.getState().setConnection({ reconnectAttempts: socketState.reconnectAttempts })
  }
  socketState.reconnectTimer = setTimeout(() => {
    socketState.reconnectTimer = undefined
    if (!socketState.manualDisconnect) connect(target, socketState.token)
  }, delay)
}

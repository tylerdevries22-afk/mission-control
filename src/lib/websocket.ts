'use client'

import { useMissionControl } from '@/store'
import { connectGateway, disconnectGateway, reconnectGateway, sendGatewayMessage } from '@/lib/websocket-transport'

/** Hook mounts share one gateway connection; transport callbacks read current store state. */
export function useWebSocket() {
  const connection = useMissionControl(state => state.connection)
  return {
    isConnected: connection.isConnected,
    connectionState: connection,
    connect: connectGateway,
    disconnect: disconnectGateway,
    reconnect: reconnectGateway,
    sendMessage: sendGatewayMessage,
  }
}

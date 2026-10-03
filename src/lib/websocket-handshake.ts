import { getCachedDeviceToken, getOrCreateDeviceIdentity, signPayload } from '@/lib/device-identity'
import { APP_VERSION } from '@/lib/version'
import { buildProtocolNegotiation, GATEWAY_OPERATOR_SCOPES } from '@/lib/websocket-utils'
import { socketLog, socketState } from '@/lib/websocket-state'

const CLIENT_ID = process.env.NEXT_PUBLIC_GATEWAY_CLIENT_ID || 'openclaw-control-ui'

export async function sendConnectHandshake(ws: WebSocket, nonce?: string) {
  if ((socketState.connectSent && !nonce) || ws.readyState !== WebSocket.OPEN || socketState.ws !== ws) return
  const attempt = ++socketState.handshakeAttempt
  socketState.connectSent = true
  let cachedToken: string | null = null
  try { cachedToken = getCachedDeviceToken() } catch { /* Storage may be unavailable. */ }
  const authToken = socketState.token || undefined
  const scopes = [...GATEWAY_OPERATOR_SCOPES]
  let device: { id: string; publicKey: string; signature: string; signedAt: number; nonce: string } | undefined
  if (nonce && !socketState.tokenOnlyFallback) {
    try {
      const identity = await getOrCreateDeviceIdentity()
      const signedAt = Date.now()
      const payload = ['v2', identity.deviceId, CLIENT_ID, 'ui', 'operator', scopes.join(','),
        String(signedAt), authToken ?? cachedToken ?? '', nonce].join('|')
      const { signature } = await signPayload(identity.privateKey, payload, signedAt)
      device = { id: identity.deviceId, publicKey: identity.publicKeyBase64, signature, signedAt, nonce }
    } catch { socketLog.warn('Device identity unavailable; proceeding without it') }
  }
  if (socketState.ws !== ws || ws.readyState !== WebSocket.OPEN || attempt !== socketState.handshakeAttempt) return
  const id = `mc-${++socketState.requestId}`
  socketState.connectId = id
  try {
    ws.send(JSON.stringify({
      type: 'req', method: 'connect', id,
      params: {
        ...buildProtocolNegotiation(),
        client: { id: CLIENT_ID, displayName: 'Mission Control', version: APP_VERSION, platform: 'web',
          mode: 'ui', instanceId: `mc-${Date.now()}` },
        role: 'operator', scopes, caps: ['tool-events'], auth: authToken ? { token: authToken } : undefined,
        device, deviceToken: socketState.tokenOnlyFallback ? undefined : (cachedToken || undefined),
      },
    }))
  } catch { ws.close(4000, 'Handshake send failed') }
}

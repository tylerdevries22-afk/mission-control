import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectGateway, disconnectGateway, reconnectGateway, sendGatewayMessage } from '@/lib/websocket-transport'
import { socketState } from '@/lib/websocket-state'

const fixture = vi.hoisted(() => ({ setConnection: vi.fn(), addLog: vi.fn(), addNotification: vi.fn(), cacheDeviceToken: vi.fn() }))
vi.mock('@/store', () => ({ useMissionControl: { getState: () => fixture } }))
vi.mock('@/lib/device-identity', () => ({ getCachedDeviceToken: () => null,
  getOrCreateDeviceIdentity: async () => ({ deviceId: 'test', publicKeyBase64: 'test', privateKey: {} }),
  signPayload: async () => ({ signature: 'test' }), cacheDeviceToken: fixture.cacheDeviceToken, clearDeviceIdentity: vi.fn() }))
vi.mock('@/lib/client-logger', () => ({ createClientLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

class FakeSocket {
  static OPEN = 1; static CONNECTING = 0; static instances: FakeSocket[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  close = vi.fn((code = 1000) => { this.readyState = 3; this.onclose?.({ code }) })
  constructor(public url: string) { FakeSocket.instances.push(this) }
  send(value: string) { this.sent.push(value) }
  open() { this.readyState = 1; this.onopen?.() }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
}

beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('WebSocket', FakeSocket); vi.clearAllMocks()
  disconnectGateway(); FakeSocket.instances = []
  socketState.url = ''; socketState.tokenOnlyFallback = socketState.tokenOnlyFallbackTried = false
  socketState.lastError = null
})
afterEach(() => { disconnectGateway(); vi.useRealTimers(); vi.unstubAllGlobals() })

async function opened() {
  connectGateway('ws://127.0.0.1:18789')
  const ws = FakeSocket.instances[0]
  ws.open(); await vi.advanceTimersByTimeAsync(80)
  return ws
}

describe('shared websocket transport', () => {
  it('requires the matching connect response and reads the modern hello token', async () => {
    const ws = await opened()
    ws.message({ type: 'res', id: 'unrelated', ok: true, payload: { auth: { deviceToken: 'wrong' } } })
    expect(socketState.handshakeComplete).toBe(false)
    ws.message({ type: 'res', id: socketState.connectId, ok: true, payload: { auth: { deviceToken: 'test-device-token' } } })
    expect(socketState.handshakeComplete).toBe(true)
    expect(fixture.cacheDeviceToken).toHaveBeenCalledWith('test-device-token')
    expect(sendGatewayMessage({ type: 'req', id: 'test', method: 'health' })).toBe(true)
  })

  it('uses the token in the handshake and removes it from URLs and connection state', async () => {
    connectGateway('ws://127.0.0.1:18789?token=test-secret')
    const ws = FakeSocket.instances[0]; ws.open(); await vi.advanceTimersByTimeAsync(80)
    expect(ws.url).toBe('ws://127.0.0.1:18789')
    expect(socketState.url).not.toContain('test-secret')
    expect(JSON.parse(ws.sent[0]).params.auth.token).toBe('test-secret')
    expect(JSON.stringify(fixture.setConnection.mock.calls)).not.toContain('test-secret')
  })

  it('keeps a deadline after the challenge and never establishes a silent peer', async () => {
    const ws = await opened()
    ws.message({ type: 'event', event: 'connect.challenge', payload: { nonce: 'test-nonce' } })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(ws.close).toHaveBeenCalledWith(4000, 'Handshake timeout')
    expect(socketState.handshakeComplete).toBe(false)
  })

  it('reconnects an established silent connection at its original URL', async () => {
    const ws = await opened()
    ws.message({ type: 'res', id: socketState.connectId, ok: true, result: { policy: { tickIntervalMs: 1000 } } })
    await vi.advanceTimersByTimeAsync(5000)
    expect(ws.close).toHaveBeenCalledWith(4000, 'Heartbeat timeout')
    expect(FakeSocket.instances[1].url).toBe('ws://127.0.0.1:18789')
  })

  it('shares one connection, cancels manual reconnects, and ignores stale socket callbacks', async () => {
    const ws = await opened()
    connectGateway('ws://127.0.0.1:18789')
    expect(FakeSocket.instances).toHaveLength(1)
    reconnectGateway(); disconnectGateway(); await vi.advanceTimersByTimeAsync(20_000)
    expect(FakeSocket.instances).toHaveLength(1)
    ws.message({ type: 'res', id: 'old', ok: true })
    expect(socketState.handshakeComplete).toBe(false)
    expect(sendGatewayMessage({ type: 'req' })).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects a malformed envelope without logging raw authentication material', async () => {
    const ws = await opened()
    ws.onmessage?.({ data: 'broken frame with test-secret' })
    expect(JSON.stringify(fixture.addLog.mock.calls)).not.toContain('test-secret')
    expect(socketState.handshakeComplete).toBe(false)
  })
})

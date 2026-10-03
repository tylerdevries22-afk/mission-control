import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGatewayHeartbeat } from '@/lib/websocket-heartbeat'

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

function monitor(hello: unknown) {
  const callbacks = { sendPing: vi.fn(), timeout: vi.fn(), latency: vi.fn() }
  const heartbeat = createGatewayHeartbeat(callbacks)
  heartbeat.start(hello)
  return { heartbeat, ...callbacks }
}

describe('gateway heartbeat capability and liveness', () => {
  it('never sends an unsupported ping and reconnects when server ticks stop', () => {
    const test = monitor({ features: { methods: ['health'] }, policy: { tickIntervalMs: 1000 } })
    vi.advanceTimersByTime(4000)
    expect(test.sendPing).not.toHaveBeenCalled()
    expect(test.timeout).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(test.timeout).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('remains live while ticks or other valid frames arrive', () => {
    const test = monitor({ policy: { tickIntervalMs: 1000 } })
    for (let index = 0; index < 10; index++) {
      vi.advanceTimersByTime(1000)
      test.heartbeat.receive()
    }
    expect(test.timeout).not.toHaveBeenCalled()
    test.heartbeat.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('measures an advertised ping including a send timestamp of zero', () => {
    vi.setSystemTime(-1000)
    const test = monitor({ features: { methods: ['ping'] }, policy: { tickIntervalMs: 1000 } })
    vi.advanceTimersByTime(1000)
    const id = test.sendPing.mock.calls[0][0]
    vi.advanceTimersByTime(25)
    expect(test.heartbeat.receive(id)).toBe(true)
    expect(test.latency).toHaveBeenCalledWith(25)
    expect(test.heartbeat.receive(id)).toBe(false)
  })

  it('keeps the watchdog after a gateway unexpectedly rejects an advertised ping', () => {
    const test = monitor({ features: { methods: ['ping'] }, policy: { tickIntervalMs: 1000 } })
    vi.advanceTimersByTime(1000)
    test.heartbeat.receive(test.sendPing.mock.calls[0][0], { message: 'unknown method: ping' })
    vi.advanceTimersByTime(6000)
    expect(test.sendPing).toHaveBeenCalledTimes(1)
    expect(test.timeout).toHaveBeenCalledTimes(1)
  })

  it('bounds unanswered pings and cleans up an earlier start', () => {
    const test = monitor({ features: { methods: ['ping'] }, policy: { tickIntervalMs: 1000 } })
    vi.advanceTimersByTime(4000)
    expect(test.heartbeat.receive(test.sendPing.mock.calls[0][0])).toBe(false)
    test.heartbeat.start({ policy: { tickIntervalMs: 1000 } })
    expect(vi.getTimerCount()).toBe(1)
    test.heartbeat.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([null, {}, { policy: { tickIntervalMs: -1 } }, { policy: { tickIntervalMs: Infinity } }])(
    'uses a bounded default when heartbeat policy is absent or invalid: %o', hello => {
      const test = monitor(hello)
      vi.advanceTimersByTime(90_000)
      expect(test.timeout).toHaveBeenCalledTimes(1)
    },
  )
})

import { numeric, record, text } from '@/lib/websocket-value'

interface HeartbeatCallbacks {
  sendPing: (id: string) => void
  timeout: () => void
  latency: (milliseconds: number) => void
}

/** Monitor server ticks even when the gateway has no ping RPC. */
export function createGatewayHeartbeat(callbacks: HeartbeatCallbacks) {
  let timer: ReturnType<typeof setInterval> | undefined
  let lastReceived = 0
  let deadlineMs = 90_000
  let supportsPing = false
  let counter = 0
  const pending = new Map<string, number>()

  function stop() {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    pending.clear()
  }

  function start(hello: unknown) {
    stop()
    const data = record(hello)
    const methods = record(data?.features)?.methods
    supportsPing = Array.isArray(methods) && methods.includes('ping')
    const advertised = numeric(record(data?.policy)?.tickIntervalMs)
    const tickMs = advertised !== undefined && advertised >= 500 && advertised <= 300_000
      ? advertised : 30_000
    deadlineMs = Math.max(5_000, tickMs * 3)
    lastReceived = Date.now()
    timer = setInterval(() => {
      const now = Date.now()
      if (now - lastReceived >= deadlineMs) {
        stop()
        callbacks.timeout()
        return
      }
      if (!supportsPing) return
      const id = `ping-${++counter}`
      if (pending.size >= 3) pending.delete(pending.keys().next().value ?? '')
      pending.set(id, now)
      callbacks.sendPing(id)
    }, Math.min(tickMs, 30_000))
  }

  function receive(id?: string, error?: unknown) {
    lastReceived = Date.now()
    if (!id) return false
    const sentAt = pending.get(id)
    if (sentAt === undefined) return false
    pending.delete(id)
    callbacks.latency(lastReceived - sentAt)
    if (/unknown method:\s*ping/i.test(text(record(error)?.message) || '')) {
      supportsPing = false
      pending.clear()
    }
    return true
  }

  return { start, stop, receive }
}

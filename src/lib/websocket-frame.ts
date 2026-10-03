import type { GatewayErrorDetail } from '@/lib/websocket-utils'
import { numeric, record, text } from '@/lib/websocket-value'

export interface GatewayFrame {
  type: 'event' | 'req' | 'res'
  event?: string
  method?: string
  id?: string
  payload?: unknown
  result?: unknown
  ok?: boolean
  error?: GatewayErrorDetail
  seq?: number
}

/** Validate the frame envelope before any connection or store mutation. */
export function decodeGatewayFrame(data: unknown): GatewayFrame | null {
  if (typeof data !== 'string') return null
  let value: unknown
  try { value = JSON.parse(data) } catch { return null }
  const frame = record(value)
  if (!frame || (frame.type !== 'event' && frame.type !== 'req' && frame.type !== 'res')) return null
  if (frame.type === 'event' && typeof frame.event !== 'string') return null
  if (frame.type === 'res' && (typeof frame.id !== 'string' || typeof frame.ok !== 'boolean')) return null
  if (frame.type === 'req' && (typeof frame.id !== 'string' || typeof frame.method !== 'string')) return null
  const error = record(frame.error)
  const details = record(error?.details)
  return {
    type: frame.type, event: text(frame.event), method: text(frame.method),
    id: text(frame.id), ok: typeof frame.ok === 'boolean' ? frame.ok : undefined,
    payload: frame.payload, result: frame.result, seq: numeric(frame.seq),
    error: error ? { message: text(error.message), code: text(error.code),
      details: details ? { code: text(details.code) } : undefined } : undefined,
  }
}

/** Modern gateways use payload; legacy gateways use result. */
export function getGatewayHello(frame: GatewayFrame): Record<string, unknown> {
  return record(frame.payload) || record(frame.result) || {}
}

import { describe, expect, it } from 'vitest'
import { decodeGatewayFrame, getGatewayHello } from '@/lib/websocket-frame'
import { jsonRecord, jsonValue, numeric, record, text } from '@/lib/websocket-value'

describe('gateway frame boundary', () => {
  it.each(['broken JSON', 'null', '[]', '{}', '{"type":"res","ok":true}', '{"type":"event","event":{}}'])(
    'rejects malformed messages: %s', raw => expect(decodeGatewayFrame(raw)).toBeNull(),
  )
  it('rejects nontext websocket messages', () => { expect(decodeGatewayFrame({ type: 'event' })).toBeNull() })
  it('accepts modern payload and legacy result hello shapes', () => {
    for (const key of ['payload', 'result']) {
      const decoded = decodeGatewayFrame(JSON.stringify({ type: 'res', id: 'mc-1', ok: true,
        [key]: { auth: { deviceToken: 'test-device-token' }, policy: { tickIntervalMs: 30000 } } }))
      expect(decoded).not.toBeNull()
      if (decoded) expect(getGatewayHello(decoded)).toMatchObject({ auth: { deviceToken: 'test-device-token' } })
    }
  })
  it('keeps only safe error fields and drops an invalid sequence number', () => {
    expect(decodeGatewayFrame(JSON.stringify({ type: 'res', id: 'mc-1', ok: false, seq: 'bad',
      error: { message: 'denied', details: { code: 'ORIGIN_NOT_ALLOWED', token: 'never-copy' } } })))
      .toMatchObject({ seq: undefined, error: { message: 'denied', details: { code: 'ORIGIN_NOT_ALLOWED' } } })
  })
})

describe('gateway event value validation', () => {
  it('validates objects, strings and finite numbers', () => {
    expect(record([])).toBeNull(); expect(record(null)).toBeNull(); expect(record({ id: 1 })).toEqual({ id: 1 })
    expect(text(1)).toBeUndefined(); expect(text('test')).toBe('test')
    expect(numeric(Infinity)).toBeUndefined(); expect(numeric('1')).toBeUndefined(); expect(numeric(0)).toBe(0)
  })
  it('copies JSON values while excluding functions and bounding recursive depth', () => {
    expect(jsonRecord({ yes: true, missing: () => 1 })).toEqual({ yes: true, missing: undefined })
    expect(jsonValue([null, 1, 'test', false])).toEqual([null, 1, 'test', false])
    expect(jsonValue(() => 1)).toBeUndefined()
    expect(jsonValue({ deep: true }, 20)).toBeUndefined()
  })
})

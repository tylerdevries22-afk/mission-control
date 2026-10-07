import { describe, expect, it } from 'vitest'
import { safeFlyErrorDiagnostic } from '../fly-error-diagnostics'
import { FlyMachinesError } from '../fly-machines-client'

describe('safe Fly failure diagnostics', () => {
  it('projects only fixed categories and bounded numeric metadata', () => {
    const error = new FlyMachinesError('synthetic-private-detail', 429, 250, 'http')
    Object.assign(error, { cause: { token: 'synthetic-private-detail' }, url: 'synthetic-private-detail' })
    expect(safeFlyErrorDiagnostic(error)).toEqual({ error: 'FlyMachinesError', failureKind: 'http', httpStatus: 429, retryAfterMs: 250 })
    expect(JSON.stringify(safeFlyErrorDiagnostic(error))).not.toContain('synthetic-private-detail')
  })
  it('rejects nonfinite, fractional, out-of-range and unknown diagnostic fields', () => {
    for (const status of [NaN, Infinity, 99, 600, 401.5, '403']) {
      expect(safeFlyErrorDiagnostic({ diagnosticFamily: 'fly_machines', diagnosticKind: 'unknown-private', status })).toEqual({
        error: 'FlyMachinesError', failureKind: 'unknown',
      })
    }
    for (const retryAfterMs of [NaN, Infinity, -1, 10_001, '1000']) {
      expect(safeFlyErrorDiagnostic({ diagnosticFamily: 'fly_machines', retryAfterMs })).not.toHaveProperty('retryAfterMs')
    }
  })
  it('never invokes diagnostic getters or inherits authority from prototypes', () => {
    let getters = 0
    const error = { diagnosticFamily: 'fly_machines' }
    for (const key of ['status', 'retryAfterMs', 'diagnosticKind', 'name', 'message', 'cause', 'stack']) {
      Object.defineProperty(error, key, { get() { getters++; throw Error('Getter must not run') } })
    }
    expect(safeFlyErrorDiagnostic(error)).toEqual({ error: 'FlyMachinesError', failureKind: 'unknown' })
    expect(safeFlyErrorDiagnostic(Object.create({ diagnosticFamily: 'fly_machines', status: 403 }))).toEqual({ error: 'unknown', failureKind: 'unknown' })
    expect(getters).toBe(0)
  })
  it('proxy traps and arbitrary values cannot replace the fixed unknown outcome', () => {
    const trapped = new Proxy({}, { getOwnPropertyDescriptor() { throw Error('synthetic-private-detail') } })
    for (const value of [trapped, undefined, null, 403, 'synthetic-private-detail', Error('synthetic-private-detail')]) {
      expect(safeFlyErrorDiagnostic(value)).toEqual({ error: 'unknown', failureKind: 'unknown' })
    }
  })
})

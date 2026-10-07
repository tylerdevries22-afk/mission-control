import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlyMachinesClient, FlyMachinesError } from '../fly-machines-client'
import { safeFlyErrorDiagnostic } from '../fly-error-diagnostics'

afterEach(() => vi.useRealTimers())
function client(fetchImpl: typeof fetch, retries = 2): FlyMachinesClient {
  return new FlyMachinesClient({ apiToken: 'synthetic-token', appName: 'synthetic-app', fetchImpl, retries, sleep: async () => {} })
}
describe('Fly request diagnostic provenance', () => {
  it('reports HTTP status without reading raw bodies and preserves read retries', async () => {
    for (const status of [401, 403, 404, 429, 503]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response('synthetic-private-detail', { status, headers: { 'retry-after': '0.25' } }))
      await expect(client(fetcher).listMachines()).rejects.toSatisfy((error: unknown) => {
        expect(safeFlyErrorDiagnostic(error)).toEqual({ error: 'FlyMachinesError', failureKind: 'http', httpStatus: status, retryAfterMs: 250 })
        expect(JSON.stringify(safeFlyErrorDiagnostic(error))).not.toContain('synthetic-private-detail')
        return true
      })
      expect(fetcher).toHaveBeenCalledTimes(status < 408 ? 1 : 3)
    }
  })
  it('distinguishes transport, body-read and decode phases without inspecting caught getters', async () => {
    const trapped = new Proxy({}, { getPrototypeOf() { throw Error('Trap must not replace request failure') }, get() { throw Error('Getter must not run') } })
    const transport = vi.fn<typeof fetch>(async () => { throw trapped })
    await expect(client(transport, 0).listMachines()).rejects.toSatisfy((error: unknown) => safeFlyErrorDiagnostic(error).failureKind === 'transport')
    const body = vi.fn<typeof fetch>(async () => {
      const response = new Response('')
      response.text = async () => { throw Error('synthetic-private-detail') }
      return response
    })
    await expect(client(body, 0).listMachines()).rejects.toSatisfy((error: unknown) => safeFlyErrorDiagnostic(error).failureKind === 'body_read')
    const decode = vi.fn<typeof fetch>(async () => new Response('not-json-synthetic-private-detail'))
    await expect(client(decode, 0).listMachines()).rejects.toSatisfy((error: unknown) => safeFlyErrorDiagnostic(error).failureKind === 'invalid_response')
  })
  it('derives timeout from the owned abort controller, not arbitrary exception text', async () => {
    vi.useFakeTimers()
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Error('synthetic-private-detail')), { once: true })
    })
    const request = new FlyMachinesClient({ apiToken: 'synthetic', appName: 'synthetic', fetchImpl: fetcher, retries: 0, timeoutMs: 100 }).listMachines()
    const checked = expect(request).rejects.toSatisfy((error: unknown) => safeFlyErrorDiagnostic(error).failureKind === 'timeout')
    await vi.advanceTimersByTimeAsync(100); await checked
  })
  it('configuration and ambiguous create retain existing ownership and no blind create retry', async () => {
    await expect(new FlyMachinesClient({}).listMachines()).rejects.toSatisfy((error: unknown) => safeFlyErrorDiagnostic(error).failureKind === 'configuration')
    const methods: string[] = []
    const fetcher: typeof fetch = async (_url, init) => {
      methods.push(init?.method ?? '')
      return init?.method === 'POST' ? new Response('', { status: 503 }) : Response.json([{ id: 'owned', name: 'stable-name' }])
    }
    await expect(client(fetcher).createMachine({ name: 'stable-name', config: {} })).resolves.toEqual({ id: 'owned', name: 'stable-name' })
    expect(methods).toEqual(['POST', 'GET'])
  })
})

type Diagnostic = ReturnType<typeof safeFlyErrorDiagnostic>
type Reconcile = (db: unknown, client: unknown, admit?: boolean) => Promise<{ ok: boolean; message: string }>
function reconcilerFixture(error: unknown, observationOnly = false) {
  const warnings: Diagnostic[] = []; const effects: string[] = []; const exports = {}
  const source = readFileSync(new URL('../fly-reconciler.ts', import.meta.url), 'utf8')
  runInNewContext(transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText, {
    exports, require(name: string) {
      if (name.endsWith('fly-error-diagnostics')) return { safeFlyErrorDiagnostic }
      if (name.endsWith('fly-machines-client')) return { FlyMachinesClient, FlyMachinesError }
      if (name.endsWith('logger')) return { logger: { warn: (value: Diagnostic) => warnings.push(value) } }
      if (name.endsWith('fly-stale-controller')) return { flyControllerIsStale: () => false }
      if (name.endsWith('fly-scheduler-lease')) return { acquireFlySchedulerLease: () => ({ assertOwned() {}, release() { effects.push('lease_release') } }) }
      if (name.endsWith('fly-queue-control')) return { expireFlyQueue() {} }
      return new Proxy({}, { get(_target, key) { return () => { effects.push(String(key)); throw Error('Admission must not run') } } })
    },
  })
  const db = { prepare: () => ({ all: () => [{ id: 'owned-job', worker_app: 'synthetic-app', machine_id: 'owned-machine', expires_at: Number.MAX_SAFE_INTEGER }], get: () => ({ pending: true }), run: () => { effects.push('job_observed') } }) }
  const provider = { appName: 'synthetic-app', isEnabled: () => true, withApp() { return this }, listMachines: async () => { if (!observationOnly) throw error; return [{ id: 'owned-machine', state: 'started' }] }, readWorkerState: async () => { throw error } }
  return { reconcile: (exports as { reconcileFlyWorkers: Reconcile }).reconcileFlyWorkers, db, provider, warnings, effects }
}
it('actual pre-admission catch records safe status and retains remote ownership without reservation', async () => {
  const fixture = reconcilerFixture(new FlyMachinesError('synthetic-private-detail', 403, undefined, 'http'))
  await expect(fixture.reconcile(fixture.db, fixture.provider)).resolves.toEqual({ ok: false, message: 'Fly unavailable; queued work and reservations retained' })
  expect(fixture.warnings).toEqual([{ error: 'FlyMachinesError', failureKind: 'http', httpStatus: 403 }])
  expect(fixture.effects).toEqual(['lease_release'])
})
it('actual pre-admission catch tolerates arbitrary throwing diagnostic/name getters', async () => {
  const error = Object.defineProperty({}, 'name', { get() { throw Error('Getter must not run') } })
  const fixture = reconcilerFixture(error)
  await expect(fixture.reconcile(fixture.db, fixture.provider)).resolves.toMatchObject({ ok: false })
  expect(fixture.warnings).toEqual([{ error: 'unknown', failureKind: 'unknown' }]); expect(fixture.effects).toEqual(['lease_release'])
})

it('actual per-job observation warning keeps the job owned and adds only safe diagnostic fields', async () => {
  const fixture = reconcilerFixture(new FlyMachinesError('synthetic-private-detail', 503, undefined, 'http'), true)
  await expect(fixture.reconcile(fixture.db, fixture.provider, false)).resolves.toMatchObject({ ok: true })
  expect(fixture.warnings).toEqual([{ jobId: 'owned-job', error: 'FlyMachinesError', failureKind: 'http', httpStatus: 503 }])
  expect(fixture.effects).toEqual(['job_observed', 'lease_release'])
})

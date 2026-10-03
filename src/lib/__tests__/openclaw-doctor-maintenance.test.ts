import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ run: vi.fn(), archive: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireRole: () => ({ user: { id: 1, username: 'admin', tenant_id: 1, workspace_id: 1 } }) }))
vi.mock('@/lib/command', () => ({ runOpenClaw: mock.run }))
vi.mock('@/lib/config', () => ({ config: { openclawStateDir: '/test/state' } }))
vi.mock('@/lib/db', () => ({ logAuditEvent: mock.audit }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/rate-limit', () => ({ openClawMaintenanceLimiter: () => null }))
vi.mock('@/lib/openclaw-doctor-fix', () => ({ archiveOrphanTranscriptsForStateDir: mock.archive }))

const fixRequest = () => new Request('http://localhost/api/openclaw/doctor', { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: 'fix_openclaw' }) })
const readRequest = () => new Request('http://localhost/api/openclaw/doctor')
const clean = { stdout: 'OK: configuration valid', stderr: '', code: 0 }

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); mock.run.mockReset()
  process.env.MC_DOCTOR_TTL_MS = '30000'
})

describe('doctor maintenance state and cache boundaries', () => {
  it('returns actionable conflict guidance without stopping a gateway or exposing raw errors', async () => {
    mock.run.mockResolvedValueOnce(clean).mockRejectedValueOnce(Object.assign(new Error('private test-token'), {
      stderr: 'StateDatabaseCoordinatorContentionError: another OpenClaw process owns gateway-lifecycle', code: 1,
    })).mockResolvedValueOnce(clean)
    const route = await import('@/app/api/openclaw/doctor/route')
    await route.GET(readRequest())
    const response = await route.POST(fixRequest())
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe('OPENCLAW_MAINTENANCE_REQUIRED')
    expect(body.error).toContain('Stop the gateway')
    expect(JSON.stringify(body)).not.toContain('private test-token')
    expect(mock.archive).not.toHaveBeenCalled(); expect(mock.audit).not.toHaveBeenCalled()
    await route.GET(readRequest())
    expect(mock.run).toHaveBeenCalledTimes(3)
  })

  it('does not allow an earlier GET to restore stale diagnostics after a fix attempt', async () => {
    let finishOld: ((value: typeof clean) => void) | undefined
    mock.run.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
      .mockRejectedValueOnce(new Error('StateDatabaseCoordinatorContentionError'))
      .mockResolvedValueOnce(clean)
    const route = await import('@/app/api/openclaw/doctor/route')
    const oldRead = route.GET(readRequest())
    await route.POST(fixRequest())
    await route.GET(readRequest())
    finishOld?.({ ...clean, stdout: '- Old warning before maintenance' })
    await oldRead
    const current = await route.GET(readRequest())
    expect(current.headers.get('X-Doctor-Cache')).toBe('hit')
    expect((await current.json()).healthy).toBe(true)
    expect(mock.run).toHaveBeenCalledTimes(3)
  })
})

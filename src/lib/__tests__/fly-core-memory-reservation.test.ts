// @vitest-environment node
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmissionRow } from '@/lib/fly-admission'
import type { ReservedJob } from '@/lib/fly-reservations'

vi.mock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
const repository = 'https://github.com/example/core-memory-fixture.git'
const peakMiB = 10985.734375
let db: Database.Database
let schema: typeof import('@/lib/fly-admission-schema')['flySubmissionSchema']
let submit: typeof import('@/lib/fly-admission')['submitFlyLeaf']
let reserve: typeof import('@/lib/fly-reservations')['reserveFlyJob']
const input = (request_id: string) => schema.parse({ title: 'Synthetic memory admission',
  description: 'Isolated SQLite contract only', repository, base_sha: 'a'.repeat(40),
  setup: 'pnpm-ci', checks: ['build'], timeout_seconds: 1800, request_id })
const submission = (id: string) => db.prepare('SELECT * FROM fly_submissions WHERE id=?').get(id) as SubmissionRow
const job = () => db.prepare('SELECT * FROM fly_worker_jobs ORDER BY rowid DESC LIMIT 1').get() as ReservedJob
function queued(requestID: string) {
  const admitted = submit(db, input(requestID), 1, 'fixture-owner')
  expect(admitted).toMatchObject({ accepted: true, state: 'queued', safe_local_fallback: false })
  if (!('submission_id' in admitted) || !admitted.submission_id) throw new Error('fixture:admission')
  return submission(admitted.submission_id)
}
function seedMeasuredHistory() {
  const row = queued('historical-core-seed')
  const machine = reserve(db, row, input('historical-core-seed'))
  expect(machine).not.toBeNull()
  const previous = job()
  db.prepare("UPDATE fly_worker_jobs SET state='succeeded',peak_cpu_percent=70,peak_memory_bytes=?,runtime_seconds=120,observed_cost_usd=0.01,completed_at=? WHERE id=?")
    .run(peakMiB * 1048576, Math.floor(Date.now() / 1000), previous.id)
  db.prepare("UPDATE fly_submissions SET state='succeeded' WHERE id=?").run(row.id)
  return previous
}
beforeEach(async () => {
  vi.resetModules()
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 28, 12))
  for (const [key, value] of Object.entries({ MC_FLY_ENABLED: 'true', FLY_API_TOKEN: 'test-only',
    MC_FLY_WORKER_APP: 'test-workers', MC_FLY_POLL_PROTOCOL: '1', MC_FLY_ALLOWED_REPOS: repository,
    MC_FLY_PRIVATE_REPOS: '', MC_FLY_CORE_IMAGE: 'registry.fly.io/test-workers@sha256:' + 'a'.repeat(64),
    MC_FLY_CORE_XLARGE_MEMORY_MB: '16384', MC_FLY_LARGE_MEMORY_MB: '',
    MC_FLY_CORE_XLARGE_HOURLY_USD: '0.22', MC_FLY_CORE_XLARGE_16384_HOURLY_USD: '0.2500416', MC_FLY_CORE_PERFORMANCE_HOURLY_USD: '0.10',
    MC_FLY_PER_JOB_BUDGET_USD: '0.25', MC_FLY_DAILY_BUDGET_USD: '3',
    MC_FLY_MONTHLY_BUDGET_USD: '65.50', MC_FLY_MAX_WORKERS: '25' })) vi.stubEnv(key, value)
  db = new Database(':memory:')
  const { runMigrations } = await import('@/lib/migrations')
  runMigrations(db)
  schema = (await import('@/lib/fly-admission-schema')).flySubmissionSchema
  submit = (await import('@/lib/fly-admission')).submitFlyLeaf
  reserve = (await import('@/lib/fly-reservations')).reserveFlyJob
})
afterEach(() => { db.close(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules() })

describe('core 16 GiB uses real history, reservation and existing budgets', () => {
  it('builds a four-performance-CPU 16 GiB Machine request from actual stored peak bytes', () => {
    seedMeasuredHistory()
    const row = queued('measured-memory-next')
    const reservation = reserve(db, row, input('measured-memory-next'))
    if (!reservation) throw new Error('fixture:reservation')
    expect(reservation.config.guest).toEqual({ cpu_kind: 'performance', cpus: 4, memory_mb: 16384 })
    expect(job()).toMatchObject({ image_kind: 'core-xlarge', hourly_rate_usd: 0.2500416, state: 'creating' })
    const stored = db.prepare('SELECT estimated_cost_usd FROM fly_worker_jobs WHERE id=?').get(job().id) as { estimated_cost_usd: number }
    expect(stored.estimated_cost_usd).toBeCloseTo(0.2500416 * 2100 / 3600, 12)
    expect(stored.estimated_cost_usd).toBeLessThan(0.25)
    expect(reservation.config.env).not.toHaveProperty('FLY_API_TOKEN')
    const payload = JSON.parse(Buffer.from(reservation.config.files[0].raw_value, 'base64').toString())
    expect(payload).toMatchObject({ repository, base_sha: 'a'.repeat(40), runtime: 'command', timeout_seconds: 1800 })
    expect(process.env.MC_FLY_MAX_WORKERS).toBe('25')
  })

  it('blocks a queued reservation if explicit 16 GiB pricing disappears after admission', () => {
    seedMeasuredHistory()
    const row = queued('unpriced-core-next')
    vi.stubEnv('MC_FLY_CORE_XLARGE_16384_HOURLY_USD', '')
    expect(reserve(db, row, input('unpriced-core-next'))).toBeNull()
    expect(submission(row.id).reason).toContain('Compute price for core-xlarge is missing')
    expect(db.prepare('SELECT COUNT(*) AS n FROM fly_worker_jobs').get()).toEqual({ n: 1 })
  })

  it('keeps cumulative per-job attempts below the saved quarter-dollar cap', () => {
    seedMeasuredHistory()
    const row = queued('cumulative-core-next')
    expect(reserve(db, row, input('cumulative-core-next'))).not.toBeNull()
    db.prepare("UPDATE fly_worker_jobs SET state='failed',observed_cost_usd=0.11 WHERE id=?").run(job().id)
    db.prepare("UPDATE fly_submissions SET state='queued',next_attempt_at=0 WHERE id=?").run(row.id)
    expect(reserve(db, submission(row.id), input('cumulative-core-next'))).toBeNull()
    expect(submission(row.id).reason).toContain('Cumulative per-job compute budget exhausted')
    expect(process.env.MC_FLY_PER_JOB_BUDGET_USD).toBe('0.25')
    expect(db.prepare('SELECT COUNT(*) AS n FROM fly_worker_jobs').get()).toEqual({ n: 2 })
  })

  it('preserves the three-dollar daily cap even when a 16 GiB job itself fits its cap', () => {
    const previous = seedMeasuredHistory()
    db.prepare('UPDATE fly_worker_jobs SET observed_cost_usd=2.90,created_at=?,completed_at=? WHERE id=?')
      .run(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000), previous.id)
    const row = queued('daily-budget-next')
    expect(reserve(db, row, input('daily-budget-next'))).toBeNull()
    expect(submission(row.id).reason).toBe('Global compute budget reserved or exhausted')
    expect(process.env.MC_FLY_DAILY_BUDGET_USD).toBe('3')
    expect(db.prepare('SELECT COUNT(*) AS n FROM fly_worker_jobs').get()).toEqual({ n: 1 })
  })

  it('preserves the authorized 65.50 monthly cap independently of the current daily budget', () => {
    const previous = seedMeasuredHistory()
    const yesterday = Math.floor(Date.now() / 86400000) * 86400 - 1
    db.prepare('UPDATE fly_worker_jobs SET observed_cost_usd=65.36,created_at=?,completed_at=? WHERE id=?')
      .run(yesterday, yesterday, previous.id)
    const row = queued('monthly-budget-next')
    expect(reserve(db, row, input('monthly-budget-next'))).toBeNull()
    expect(submission(row.id).reason).toBe('Global compute budget reserved or exhausted')
    expect(process.env.MC_FLY_DAILY_BUDGET_USD).toBe('3')
    expect(process.env.MC_FLY_MONTHLY_BUDGET_USD).toBe('65.50')
    expect(db.prepare('SELECT COUNT(*) AS n FROM fly_worker_jobs').get()).toEqual({ n: 1 })
  })
})

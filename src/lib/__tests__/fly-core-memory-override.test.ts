import { afterEach, describe, expect, it, vi } from 'vitest'

const image = 'registry.fly.io/test-workers@sha256:' + 'a'.repeat(64)
const input = { setup: 'pnpm-ci' as const, checks: ['build' as const], timeout_seconds: 1800 }
const history = (memoryMb = 10985.734375) => [{ cpuPercent: 70, memoryMb, runtimeSeconds: 120, costUsd: 0.01, cpus: 4 }]
function configure(core = '', legacy = '') {
  vi.resetModules()
  for (const [key, value] of Object.entries({ MC_FLY_CORE_XLARGE_MEMORY_MB: core,
    MC_FLY_LARGE_MEMORY_MB: legacy, MC_FLY_CORE_XLARGE_HOURLY_USD: '0.22', MC_FLY_CORE_XLARGE_16384_HOURLY_USD: '0.2500416',
    MC_FLY_CORE_PERFORMANCE_HOURLY_USD: '0.10', MC_FLY_CORE_IMAGE: image,
    MC_FLY_WORKER_APP: 'test-workers', MC_FLY_PER_JOB_BUDGET_USD: '0.25' })) vi.stubEnv(key, value)
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('explicit core-only 16 GiB Fly capacity', () => {
  it.each([['', 8192], ['9216', 9216], ['12288', 8192], ['16384', 8192]] as const)
  ('preserves canonical browser capacity with the core opt-in and legacy setting %s', async (legacy, browserMemory) => {
    configure('16384', legacy)
    const { FLY_WORKER_SPECS } = await import('@/lib/fly-workers')
    expect(FLY_WORKER_SPECS['core-xlarge']).toMatchObject({ workerClass: 'core', memoryMb: 16384, cpus: 4, cpuKind: 'performance' })
    expect(FLY_WORKER_SPECS['browser-large']).toMatchObject({ workerClass: 'browser', memoryMb: browserMemory, cpus: 4, cpuKind: 'performance' })
    expect(FLY_WORKER_SPECS['core-performance'].memoryMb).toBe(4096)
    expect(FLY_WORKER_SPECS['browser-standard'].memoryMb).toBe(4096)
    expect(FLY_WORKER_SPECS['core-small'].memoryMb).toBe(1024)
    expect(FLY_WORKER_SPECS['core-standard'].memoryMb).toBe(2048)
  })

  it.each(['', '9216', '12288', '16384.0', ' 16384', '16384 ', '016384', '32768', '-1', 'NaN', 'Infinity'])
  ('falls back to existing approved legacy capacity for unsupported core flag %s', async core => {
    configure(core, '12288')
    const { FLY_WORKER_SPECS } = await import('@/lib/fly-workers')
    expect(FLY_WORKER_SPECS['core-xlarge'].memoryMb).toBe(12288)
    expect(FLY_WORKER_SPECS['browser-large'].memoryMb).toBe(8192)
  })

  it('retains the default 8 GiB class when both controls are absent', async () => {
    configure()
    vi.unstubAllEnvs()
    vi.stubEnv('MC_FLY_CORE_XLARGE_MEMORY_MB', undefined)
    vi.stubEnv('MC_FLY_LARGE_MEMORY_MB', undefined)
    const { FLY_WORKER_SPECS } = await import('@/lib/fly-workers')
    expect(FLY_WORKER_SPECS['core-xlarge'].memoryMb).toBe(8192)
    expect(FLY_WORKER_SPECS['browser-large'].memoryMb).toBe(8192)
  })

  it('fits the actual historical 10985.734375 MiB peak with unchanged 25 percent headroom', async () => {
    configure('16384')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    const result = pricedFlyJob(input, history())
    expect(result.spec).toMatchObject({ size: 'core-xlarge', memoryMb: 16384, cpus: 4, cpuKind: 'performance' })
    expect(result.issues).toEqual([])
    expect(result.reserve).toBeCloseTo(0.2500416 * 2100 / 3600, 12)
    expect(result.reserve).toBeLessThan(0.25)
    expect(pricedFlyJob(input, history(16384 / 1.25)).issues).toEqual([])
    expect(pricedFlyJob(input, history(16384 / 1.25 + 1 / 1048576)).issues)
      .toContain('Historical memory exceeds the largest approved class with safety headroom')
  })

  it('does not admit that peak at the unchanged legacy 12 GiB fallback', async () => {
    configure('', '12288')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    expect(pricedFlyJob(input, history()).issues)
      .toContain('Historical memory exceeds the largest approved class with safety headroom')
  })

  it.each(['', '0', '-1', 'NaN', 'Infinity'])('requires an explicit valid 16 GiB price instead of the 8 GiB fallback: %s', async price => {
    configure('16384')
    vi.stubEnv('MC_FLY_CORE_XLARGE_16384_HOURLY_USD', price)
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    const result = pricedFlyJob(input, history())
    expect(result.rate).toBe(0)
    expect(result.issues).toContain('Compute price for core-xlarge is missing')
  })

  it('keeps the saved per-job quarter-dollar cap with explicit expanded pricing', async () => {
    configure('16384')
    vi.stubEnv('MC_FLY_CORE_XLARGE_16384_HOURLY_USD', '0.50')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    expect(pricedFlyJob(input, history()).issues).toContain('Per-job compute budget exceeded')
    expect(process.env.MC_FLY_PER_JOB_BUDGET_USD).toBe('0.25')
  })
  it('does not expand or reprice browser workers when the core-only 16 GiB option is enabled', async () => {
    configure('16384', '12288')
    vi.stubEnv('MC_FLY_BROWSER_IMAGE', image)
    vi.stubEnv('MC_FLY_BROWSER_LARGE_HOURLY_USD', '0.22')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    const browser = { ...input, setup: 'pnpm-ci-playwright' as const, checks: ['test' as const] }
    const result = pricedFlyJob(browser, history(6500))
    expect(result.spec).toMatchObject({ workerClass: 'browser', memoryMb: 8192, cpus: 4, cpuKind: 'performance' })
    expect(result.rate).toBe(0.22)
    expect(result.issues).toEqual([])
    expect(pricedFlyJob(browser, history(7000)).issues)
      .toContain('Historical memory exceeds the largest approved class with safety headroom')
  })

  it('keeps the legacy non-16-GiB core price independent from the new dedicated rate', async () => {
    configure('', '12288')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    const result = pricedFlyJob(input, history(8167))
    expect(result.spec.memoryMb).toBe(12288)
    expect(result.rate).toBe(0.22)
    expect(result.issues).toEqual([])
  })
})

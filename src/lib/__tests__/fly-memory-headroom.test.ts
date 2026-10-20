import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('Fly peak memory selection and admission agree', () => {
  function configure(memory = '') {
    vi.resetModules()
    vi.stubEnv('MC_FLY_LARGE_MEMORY_MB', memory)
    vi.stubEnv('MC_FLY_CORE_XLARGE_HOURLY_USD', '0.22')
    vi.stubEnv('MC_FLY_CORE_PERFORMANCE_HOURLY_USD', '0.10')
    vi.stubEnv('MC_FLY_CORE_IMAGE', `registry.fly.io/mission-control-workers-tyler@sha256:${'a'.repeat(64)}`)
    vi.stubEnv('MC_FLY_WORKER_APP', 'mission-control-workers-tyler')
    vi.stubEnv('MC_FLY_PER_JOB_BUDGET_USD', '0.25')
  }
  const input = { setup: 'npm-ci' as const, checks: ['test' as const], timeout_seconds: 1800 }
  const sample = (memoryMb: number) => ({ cpuPercent: 20, memoryMb, runtimeSeconds: 120, costUsd: 0.01, cpus: 2 })

  it('uses an available larger class for a real peak outside the p95 sample', async () => {
    configure()
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    const history = [...Array.from({ length: 49 }, () => sample(3000)), sample(3375.28515625)]
    const result = pricedFlyJob(input, history)
    expect(result.spec.memoryMb).toBe(8192)
    expect(result.issues).toEqual([])
  })

  it('admits the observed build peak with 25 percent headroom only at explicit 12 GiB capacity', async () => {
    configure('12288')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    const result = pricedFlyJob({ ...input, checks: ['build'] }, [sample(8167.03515625)])
    expect(result.spec.memoryMb).toBe(12288)
    expect(result.issues).toEqual([])
    expect(result.reserve).toBeLessThan(0.25)
    expect(pricedFlyJob(input, [sample(10000)]).issues)
      .toContain('Historical memory exceeds the largest approved class with safety headroom')
  })

  it('still requires an explicit price for expanded capacity and enforces the existing budget', async () => {
    configure('12288')
    vi.stubEnv('MC_FLY_CORE_XLARGE_HOURLY_USD', '')
    const { pricedFlyJob } = await import('@/lib/fly-pricing')
    expect(pricedFlyJob(input, [sample(8167)]).issues).toContain('Compute price for core-xlarge is missing')
    vi.stubEnv('MC_FLY_CORE_XLARGE_HOURLY_USD', '0.22')
    vi.stubEnv('MC_FLY_PER_JOB_BUDGET_USD', '0.01')
    expect(pricedFlyJob(input, [sample(8167)]).issues).toContain('Per-job compute budget exceeded')
  })
})

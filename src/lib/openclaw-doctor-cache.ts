import { runOpenClaw } from '@/lib/command'
import { config } from '@/lib/config'
import { parseOpenClawDoctorOutput } from '@/lib/openclaw-doctor'
import { getCommandDetail, isMissingOpenClaw } from '@/lib/openclaw-doctor-command'

interface CachedDoctor {
  payload: unknown
  status: number
  fetchedAt: number
}
const configuredTtl = Number.parseInt(process.env.MC_DOCTOR_TTL_MS || '', 10)
const ttlMs = Number.isFinite(configuredTtl) && configuredTtl >= 0 ? configuredTtl : 300_000
let cached: CachedDoctor | null = null
let inFlight: Promise<CachedDoctor> | null = null
let generation = 0

/** In-flight reads from before maintenance cannot repopulate the current cache. */
export function invalidateDoctorCache() {
  generation += 1
  cached = null
  inFlight = null
}

async function runDoctor(): Promise<CachedDoctor> {
  try {
    const result = await runOpenClaw(['doctor'], { timeoutMs: 30_000 })
    return { payload: parseOpenClawDoctorOutput(`${result.stdout}\n${result.stderr}`, result.code ?? 0,
      { stateDir: config.openclawStateDir }), status: 200, fetchedAt: Date.now() }
  } catch (error) {
    const { detail, code } = getCommandDetail(error)
    if (isMissingOpenClaw(detail)) {
      return { payload: { error: 'OpenClaw is not installed or not reachable' }, status: 400, fetchedAt: Date.now() }
    }
    return { payload: parseOpenClawDoctorOutput(detail.replace(/^Command failed[^:]*:\s*/i, ''), code ?? 1,
      { stateDir: config.openclawStateDir }), status: 200, fetchedAt: Date.now() }
  }
}

/** Coalesce ambient polling and cache diagnostics for five minutes by default. */
export async function getOpenClawDoctorStatus(): Promise<CachedDoctor & { cache: 'hit' | 'miss'; ageMs?: number }> {
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return { ...cached, cache: 'hit', ageMs: Date.now() - cached.fetchedAt }
  }
  if (!inFlight) {
    const startedGeneration = generation
    const run = runDoctor().then(entry => {
      if (generation === startedGeneration && entry.status === 200) cached = entry
      return entry
    }).finally(() => { if (inFlight === run) inFlight = null })
    inFlight = run
  }
  return { ...await inFlight, cache: 'miss' }
}

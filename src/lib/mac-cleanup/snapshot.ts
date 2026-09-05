import { getDatabase } from '@/lib/db'
import { collectLiveMetrics } from './metrics'
import { evaluateBreaches, recommendAction } from './policy'
import { countStaleLocks, listAutomations, readLaunchdMap } from './status'
import { readWatchState } from './state'
import { DEFAULT_THRESHOLDS } from './types'
import type { MacCleanupSnapshot } from './types'

function isWatchEnabled(): boolean {
  try {
    const row = getDatabase()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('general.mac_cleanup_watch') as { value: string } | undefined
    if (row) return row.value === 'true'
    return true
  } catch {
    return true
  }
}

export async function buildMacCleanupSnapshot(): Promise<MacCleanupSnapshot> {
  const available = process.platform === 'darwin'
  const [launchd, metrics] = await Promise.all([
    readLaunchdMap(),
    collectLiveMetrics({ samplePackages: available }),
  ])
  const automations = listAutomations(launchd)
  const thresholds = DEFAULT_THRESHOLDS
  const breaches = evaluateBreaches(metrics, thresholds)
  const recommendation = recommendAction(metrics, breaches, thresholds)
  const watch = readWatchState()

  return {
    timestamp: Date.now(),
    platform: process.platform,
    available,
    metrics,
    thresholds,
    breaches,
    recommendation,
    automations,
    findings: buildFindings(automations, metrics, countStaleLocks(), available),
    watch: { enabled: isWatchEnabled(), lastAutoAt: watch.lastAutoAt },
  }
}

function buildFindings(
  automations: MacCleanupSnapshot['automations'],
  metrics: MacCleanupSnapshot['metrics'],
  staleLocks: number,
  available: boolean,
): string[] {
  if (!available) return ['Mac cleanup automations are only available on the Darwin host.']

  const findings: string[] = []
  const guardian = automations.find((job) => job.id === 'resource-guardian')
  const storage = automations.find((job) => job.id === 'storage-maintenance')
  const cleanMac = automations.find((job) => job.id === 'clean-mac')
  const cleanRam = automations.find((job) => job.id === 'clean-ram')
  const legacy = automations.find((job) => job.id === 'safe-disk-maintenance')

  if (cleanMac?.loaded && cleanRam?.loaded && guardian?.loaded) {
    findings.push('clean-mac and clean-ram LaunchAgents are healthchecks that overlap the guardian and discard logs to /dev/null.')
  }
  if (legacy && !legacy.loaded) {
    findings.push('Legacy safe-disk-maintenance is not loaded. Keep it unloaded; it deletes caches and prunes Docker images.')
  }
  if (staleLocks > 0) {
    findings.push(`${staleLocks} stale guardian lock directories are left in ~/.local/state/mac-resource-guardian.`)
  }
  if (storage?.lastStatus === 'critical_pressure' || storage?.lastStatus === 'pressure_persisted') {
    findings.push(`Storage last run ended ${storage.lastStatus} (npm/pnpm prune deferred or pressure remained).`)
  }
  if (metrics.swapUsedPercent != null && metrics.swapUsedPercent >= 80) {
    findings.push('Swap is nearly full. The LaunchAgent only watches memory_pressure free percent, so it misses swap thrash.')
  }
  if (guardian?.loaded && guardian.lastCycleAt) {
    const age = Math.floor(Date.now() / 1000) - guardian.lastCycleAt
    if (age > 180) findings.push(`Guardian last-cycle stamp is ${age}s old (healthcheck stale after 180s).`)
  }
  if (findings.length === 0) findings.push('Host automations are loaded and no structural issues were found.')
  return findings
}

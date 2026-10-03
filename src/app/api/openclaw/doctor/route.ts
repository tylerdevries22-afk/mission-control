import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { runOpenClaw } from '@/lib/command'
import { config } from '@/lib/config'
import { logAuditEvent } from '@/lib/db'
import { logger } from '@/lib/logger'
import { archiveOrphanTranscriptsForStateDir } from '@/lib/openclaw-doctor-fix'
import { parseOpenClawDoctorOutput } from '@/lib/openclaw-doctor'
import { openClawMaintenanceLimiter } from '@/lib/rate-limit'
import { openClawDoctorFixSchema, validateBody } from '@/lib/validation'
import { getCommandDetail, isMissingOpenClaw, isOpenClawMaintenanceContention } from '@/lib/openclaw-doctor-command'
import { getOpenClawDoctorStatus, invalidateDoctorCache } from '@/lib/openclaw-doctor-cache'

export async function GET(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const result = await getOpenClawDoctorStatus()
  return NextResponse.json(result.payload, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', 'X-Doctor-Cache': result.cache,
      ...(result.ageMs === undefined ? {} : { 'X-Doctor-Age-Ms': String(result.ageMs) }) },
  })
}

export async function POST(request: Request) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limitKey = `${auth.user.tenant_id ?? 1}:${auth.user.workspace_id ?? 1}:${auth.user.id}`
  const limited = openClawMaintenanceLimiter(limitKey)
  if (limited) return limited

  const validated = await validateBody(request, openClawDoctorFixSchema)
  if ('error' in validated) return validated.error

  try {
    const progress: Array<{ step: string; detail: string }> = []

    await runOpenClaw(['doctor', '--fix'], { timeoutMs: 120000 })
    progress.push({ step: 'doctor', detail: 'Applied OpenClaw doctor config fixes.' })

    try {
      await runOpenClaw(['sessions', 'cleanup', '--all-agents', '--enforce', '--fix-missing'], { timeoutMs: 120000 })
      progress.push({ step: 'sessions', detail: 'Pruned missing transcript entries from session stores.' })
    } catch {
      progress.push({ step: 'sessions', detail: 'Session cleanup could not complete.' })
    }

    const orphanFix = archiveOrphanTranscriptsForStateDir(config.openclawStateDir)
    progress.push({
      step: 'orphans',
      detail:
        orphanFix.archivedOrphans > 0
          ? `Archived ${orphanFix.archivedOrphans} orphan transcript file(s) across ${orphanFix.storesScanned} session store(s).`
          : `No orphan transcript files found across ${orphanFix.storesScanned} session store(s).`,
    })

    const postFix = await runOpenClaw(['doctor'], { timeoutMs: 15000 })
    const status = parseOpenClawDoctorOutput(`${postFix.stdout}\n${postFix.stderr}`, postFix.code ?? 0, {
      stateDir: config.openclawStateDir,
    })
    const safeStatus = Object.fromEntries(
      Object.entries(status).filter(([key]) => key !== 'raw'),
    )

    try {
      logAuditEvent({
        action: 'openclaw.doctor.fix',
        actor: auth.user.username,
        actor_id: auth.user.id,
        target_type: 'runtime',
        detail: { level: status.level, healthy: status.healthy, issues: status.issues },
      })
    } catch {
      // Non-critical.
    }

    return NextResponse.json({
      success: true,
      progress,
      status: safeStatus,
    })
  } catch (error) {
    const { detail } = getCommandDetail(error)
    if (isMissingOpenClaw(detail)) {
      return NextResponse.json({ error: 'OpenClaw is not installed or not reachable' }, { status: 400 })
    }

    if (isOpenClawMaintenanceContention(detail)) {
      return NextResponse.json({
        error: 'OpenClaw is in use. Stop the gateway and other OpenClaw processes before repairing state, then start the gateway again.',
        code: 'OPENCLAW_MAINTENANCE_REQUIRED',
      }, { status: 409 })
    }

    logger.error({ actor: auth.user.username }, 'OpenClaw doctor fix failed')

    return NextResponse.json(
      { error: 'OpenClaw doctor fix failed' },
      { status: 500 }
    )
  } finally {
    // A failed fix can still change state; prevent an earlier GET from restoring stale diagnostics.
    invalidateDoctorCache()
  }
}

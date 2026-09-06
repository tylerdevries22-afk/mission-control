import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { buildFlyTelemetry } from '@/lib/fly-telemetry'
import { getHostMetrics } from '@/lib/host-metrics'
import { logger } from '@/lib/logger'
import { denyUnscopedResourceForStrictWorkspace } from '@/lib/workspace-isolation'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const denied = denyUnscopedResourceForStrictWorkspace(auth.user,'host_administration','/api/fly/telemetry')
  if (denied) return denied
  try {
    return NextResponse.json(buildFlyTelemetry(getDatabase(), auth.user.workspace_id ?? 1, await getHostMetrics()))
  } catch (err) {
    logger.error({ err }, 'Fly telemetry request failed')
    return NextResponse.json({ error: 'Unable to load Fly telemetry' }, { status: 500 })
  }
}


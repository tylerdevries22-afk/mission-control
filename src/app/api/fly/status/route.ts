import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { flySubmissionStatus } from '@/lib/fly-admission'
import { flyReadiness } from '@/lib/fly-admission-schema'
import { releaseQueuedFlySubmission } from '@/lib/fly-queue-control'
import { mutationLimiter } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const id = request.nextUrl.searchParams.get('submission_id') || undefined
  if (id && !/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
  try {
    const issues = flyReadiness()
    return NextResponse.json({ ready: !issues.length, issues, transport: 'polled', cost_basis: 'estimated Fly compute; excludes inference, storage and egress',
      submissions: flySubmissionStatus(getDatabase(), auth.user.workspace_id, id) })
  } catch {
    return NextResponse.json({ error: 'Fly status is unavailable' }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const limited = mutationLimiter(request)
  if (limited) return limited
  const id = request.nextUrl.searchParams.get('submission_id') || ''
  if (!/^[a-f0-9]{32}$/.test(id)) return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
  try {
    const result = releaseQueuedFlySubmission(getDatabase(),auth.user.workspace_id,id,'cancelled')
    return NextResponse.json(result,{ status: result.released ? 200 : 409 })
  } catch {
    return NextResponse.json({ error: 'Cancellation unconfirmed; remote ownership retained' },{ status: 503 })
  }
}


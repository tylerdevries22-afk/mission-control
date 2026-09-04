import { NextRequest, NextResponse } from 'next/server'
import { getAllGatewaySessions } from '@/lib/sessions'
import { syncClaudeSessions } from '@/lib/claude-sessions'
import { db_helpers } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { callOpenClawGateway } from '@/lib/openclaw-gateway'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { denyUnscopedResourceForStrictWorkspace } from '@/lib/workspace-isolation'
import { listNormalizedLocalSessions } from '@/lib/local-session-list'
import { matchesSessionFilters } from '@/lib/session-record'
import { dedupeAndSortSessions, mapGatewaySessions } from '@/lib/session-merge'

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const isolationDenied = denyUnscopedResourceForStrictWorkspace(auth.user, 'local_sessions', new URL(request.url).pathname)
  if (isolationDenied) return isolationDenied

  try {
    const { searchParams } = new URL(request.url)
    const filters = {
      agent: searchParams.get('agent') || undefined,
      project: searchParams.get('project') || undefined,
      active: searchParams.get('active') || undefined,
      environment: searchParams.get('environment') || undefined,
    }
    await syncClaudeSessions()
    const localMerged = listNormalizedLocalSessions(filters)
    const mappedGatewaySessions = mapGatewaySessions(getAllGatewaySessions())
      .filter((session) => matchesSessionFilters(session, filters))
    const merged = dedupeAndSortSessions([...mappedGatewaySessions, ...localMerged])
    return NextResponse.json({ sessions: merged })
  } catch (error) {
    logger.error({ err: error }, 'Sessions API error')
    return NextResponse.json({ sessions: [] })
  }
}

const VALID_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
const VALID_VERBOSE_LEVELS = ['off', 'on', 'full'] as const
const VALID_REASONING_LEVELS = ['off', 'on', 'stream'] as const
const SESSION_KEY_RE = /^[a-zA-Z0-9:_.-]+$/

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const isolationDenied = denyUnscopedResourceForStrictWorkspace(auth.user, 'gateway_sessions', new URL(request.url).pathname)
  if (isolationDenied) return isolationDenied

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const body = await request.json()
    const { sessionKey } = body

    if (!sessionKey || !SESSION_KEY_RE.test(sessionKey)) {
      return NextResponse.json({ error: 'Invalid session key' }, { status: 400 })
    }

    let rpcMethod: string
    let rpcParams: Record<string, unknown>
    let logDetail: string

    switch (action) {
      case 'set-thinking': {
        const { level } = body
        if (!VALID_THINKING_LEVELS.includes(level)) {
          return NextResponse.json({ error: `Invalid thinking level. Must be: ${VALID_THINKING_LEVELS.join(', ')}` }, { status: 400 })
        }
        rpcMethod = 'session_setThinking'
        rpcParams = { sessionKey, level }
        logDetail = `Set thinking=${level} on ${sessionKey}`
        break
      }
      case 'set-verbose': {
        const { level } = body
        if (!VALID_VERBOSE_LEVELS.includes(level)) {
          return NextResponse.json({ error: `Invalid verbose level. Must be: ${VALID_VERBOSE_LEVELS.join(', ')}` }, { status: 400 })
        }
        rpcMethod = 'session_setVerbose'
        rpcParams = { sessionKey, level }
        logDetail = `Set verbose=${level} on ${sessionKey}`
        break
      }
      case 'set-reasoning': {
        const { level } = body
        if (!VALID_REASONING_LEVELS.includes(level)) {
          return NextResponse.json({ error: `Invalid reasoning level. Must be: ${VALID_REASONING_LEVELS.join(', ')}` }, { status: 400 })
        }
        rpcMethod = 'session_setReasoning'
        rpcParams = { sessionKey, level }
        logDetail = `Set reasoning=${level} on ${sessionKey}`
        break
      }
      case 'set-label': {
        const { label } = body
        if (typeof label !== 'string' || label.length > 100) {
          return NextResponse.json({ error: 'Label must be a string up to 100 characters' }, { status: 400 })
        }
        rpcMethod = 'session_setLabel'
        rpcParams = { sessionKey, label }
        logDetail = `Set label="${label}" on ${sessionKey}`
        break
      }
      default:
        return NextResponse.json({ error: 'Invalid action. Must be: set-thinking, set-verbose, set-reasoning, set-label' }, { status: 400 })
    }

    const result = await callOpenClawGateway(rpcMethod, rpcParams, 10_000)

    db_helpers.logActivity(
      'session_control',
      'session',
      0,
      auth.user.username,
      logDetail,
      { session_key: sessionKey, action }
    )

    return NextResponse.json({ success: true, action, sessionKey, result })
  } catch (error: any) {
    logger.error({ err: error }, 'Session POST error')
    return NextResponse.json({ error: error.message || 'Session action failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const isolationDenied = denyUnscopedResourceForStrictWorkspace(auth.user, 'gateway_sessions', new URL(request.url).pathname)
  if (isolationDenied) return isolationDenied

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const body = await request.json()
    const { sessionKey } = body

    if (!sessionKey || !SESSION_KEY_RE.test(sessionKey)) {
      return NextResponse.json({ error: 'Invalid session key' }, { status: 400 })
    }

    const result = await callOpenClawGateway('session_delete', { sessionKey }, 10_000)

    db_helpers.logActivity(
      'session_control',
      'session',
      0,
      auth.user.username,
      `Deleted session ${sessionKey}`,
      { session_key: sessionKey, action: 'delete' }
    )

    return NextResponse.json({ success: true, sessionKey, result })
  } catch (error: any) {
    logger.error({ err: error }, 'Session DELETE error')
    return NextResponse.json({ error: error.message || 'Session deletion failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'

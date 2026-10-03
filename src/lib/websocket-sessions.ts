import type { Session } from '@/store'
import { useMissionControl } from '@/store'
import { normalizeModel } from '@/lib/utils'
import { numeric, record, text } from '@/lib/websocket-value'

function formatSessionAge(timestamp?: number): string {
  if (!timestamp) return '-'
  const minutes = Math.floor((Date.now() - timestamp) / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  return days > 0 ? `${days}d` : hours > 0 ? `${hours}h` : `${minutes}m`
}

export function applyGatewaySessionSnapshot(snapshot: unknown) {
  const sessions = record(snapshot)?.sessions
  if (!Array.isArray(sessions)) return
  const mapped: Session[] = []
  for (const [index, value] of sessions.entries()) {
    const session = record(value)
    if (!session) continue
    const updatedAt = numeric(session.updatedAt)
    mapped.push({
      id: text(session.sessionId) || text(session.id) || text(session.key) || `session-${index}`,
      key: text(session.key) || '', agent: text(session.agent), channel: text(session.channel),
      kind: text(session.kind) || 'unknown', age: formatSessionAge(updatedAt),
      model: normalizeModel(session.model), tokens: `${numeric(session.totalTokens) || 0}/${numeric(session.contextTokens) || 35000}`,
      flags: [], active: Boolean(updatedAt && Date.now() - updatedAt < 3_600_000),
      startTime: updatedAt, lastActivity: updatedAt,
      messageCount: numeric(session.messageCount), cost: numeric(session.cost), source: 'gateway',
    })
  }
  useMissionControl.getState().setSessions(mapped)
}

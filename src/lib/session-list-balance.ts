import { TREE_KINDS } from './chat-session-identity'

const PER_TREE_KIND = 20
const TOTAL_LIMIT = 120

export function takeBalancedSessions(
  sessions: Array<Record<string, unknown>>,
  limit = TOTAL_LIMIT,
): Array<Record<string, unknown>> {
  const sorted = [...sessions].sort(
    (a, b) => Number(b?.lastActivity || 0) - Number(a?.lastActivity || 0),
  )
  const picked: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  const keyOf = (session: Record<string, unknown>) => `${session.source || ''}:${session.id || ''}`

  for (const kind of TREE_KINDS) {
    let count = 0
    for (const session of sorted) {
      if (session.kind !== kind) continue
      const key = keyOf(session)
      if (!session.id || seen.has(key)) continue
      picked.push(session)
      seen.add(key)
      count += 1
      if (count >= PER_TREE_KIND) break
    }
  }

  for (const session of sorted) {
    if (picked.length >= limit) break
    const key = keyOf(session)
    if (!session.id || seen.has(key)) continue
    picked.push(session)
    seen.add(key)
  }

  return picked.sort(
    (a, b) => Number(b?.lastActivity || 0) - Number(a?.lastActivity || 0),
  )
}

export function dedupeAndSortSessions(merged: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const deduped = new Map<string, Record<string, unknown>>()
  for (const session of merged) {
    const id = String(session?.id || '')
    const source = String(session?.source || '')
    const key = `${source}:${id}`
    if (!id) continue
    const existing = deduped.get(key)
    const currentActivity = Number(session?.lastActivity || 0)
    const existingActivity = Number(existing?.lastActivity || 0)
    if (!existing || currentActivity > existingActivity) deduped.set(key, session)
  }
  return takeBalancedSessions(Array.from(deduped.values()))
}

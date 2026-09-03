import { describe, expect, it } from 'vitest'
import { takeBalancedSessions } from '../session-list-balance'

describe('takeBalancedSessions', () => {
  it('reserves recent slots for each tree engine', () => {
    const sessions = [
      ...Array.from({ length: 80 }, (_, i) => ({ id: `c${i}`, kind: 'codex-cli', source: 'local', lastActivity: 1000 + i })),
      { id: 'g1', kind: 'grok', source: 'local', lastActivity: 10 },
      { id: 'k1', kind: 'kimi', source: 'local', lastActivity: 11 },
      { id: 'cl1', kind: 'claude-code', source: 'local', lastActivity: 12 },
    ]
    const picked = takeBalancedSessions(sessions, 40)
    const kinds = new Set(picked.map((session) => session.kind))
    expect(kinds.has('grok')).toBe(true)
    expect(kinds.has('kimi')).toBe(true)
    expect(kinds.has('claude-code')).toBe(true)
    expect(kinds.has('codex-cli')).toBe(true)
    expect(picked.length).toBeLessThanOrEqual(40)
  })
})

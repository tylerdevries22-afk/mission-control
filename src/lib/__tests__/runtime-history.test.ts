import { describe, expect, it } from 'vitest'
import { agentNameForSession, shouldKeepExternalSession } from '@/lib/runtime-history'

describe('runtime history', () => {
  it('keeps prefixed runtime sessions during Claude orphan cleanup', () => {
    expect(shouldKeepExternalSession('grok:abc')).toBe(true)
    expect(shouldKeepExternalSession('kimi:abc')).toBe(true)
    expect(shouldKeepExternalSession('codex:abc')).toBe(true)
    expect(shouldKeepExternalSession('uuid-without-prefix')).toBe(false)
  })

  it('maps shared Claude home sessions to claude-20x, never leftover claude', () => {
    expect(agentNameForSession('abc', '~/Dev/actz-may')).toBe('claude-20x')
    expect(agentNameForSession('abc', '~/.openclaw/workspace-claude-5x')).toBe('claude-5x')
    expect(agentNameForSession('grok:1', null)).toBe('grok')
  })
})

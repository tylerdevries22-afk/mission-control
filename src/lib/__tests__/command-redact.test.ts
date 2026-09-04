import { describe, expect, it } from 'vitest'
import { redactCommandLine } from '../command'

describe('redactCommandLine', () => {
  it('hides long or whitespace-containing args', () => {
    expect(redactCommandLine('kimi', ['-S', 'sess-1', '-p', 'secret token value'])).toBe('kimi -S sess-1 -p [redacted]')
    expect(redactCommandLine('codex', ['exec', 'resume', 'id', 'sk-live-secret-key-that-is-long'])).toContain('[redacted]')
  })
})

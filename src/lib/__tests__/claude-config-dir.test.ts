import { describe, expect, it } from 'vitest'
import { claudeConfigDirForAgent } from '@/lib/claude-config-dir'

describe('claudeConfigDirForAgent', () => {
  it('never invents a config dir and ignores non-Claude fleet names', () => {
    const twenty = claudeConfigDirForAgent('claude-20x')
    const five = claudeConfigDirForAgent('claude-5x')
    if (twenty) expect(twenty.endsWith('.claude-20x')).toBe(true)
    if (five) expect(five.endsWith('.claude-5x')).toBe(true)
    expect(claudeConfigDirForAgent('codex')).toBeUndefined()
    expect(claudeConfigDirForAgent('claude')).toBeUndefined()
  })
})

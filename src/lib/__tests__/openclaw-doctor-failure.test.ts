import { describe, expect, it } from 'vitest'
import { parseOpenClawDoctorOutput } from '@/lib/openclaw-doctor'

describe('OpenClaw doctor command failures', () => {
  it.each([1, 126, 127])('never reports a failed command as healthy (exit %i)', code => {
    const result = parseOpenClawDoctorOutput('Error: permission denied', code)
    expect(result.level).toBe('error')
    expect(result.healthy).toBe(false)
    expect(result.canFix).toBe(false)
    expect(result.issues).toEqual(['OpenClaw doctor could not complete. Check the runtime logs and try again.'])
    expect(result.summary).not.toContain('permission denied')
  })

  it('keeps real findings and fix availability when the command fails', () => {
    const result = parseOpenClawDoctorOutput('- Invalid config: unrecognized key', 1)
    expect(result.level).toBe('error')
    expect(result.category).toBe('config')
    expect(result.canFix).toBe(true)
    expect(result.issues).toEqual(['Invalid config: unrecognized key'])
  })

  it('does not erase a command failure when every bullet is informational', () => {
    const result = parseOpenClawDoctorOutput(`Command failed (openclaw doctor):
- Personal Codex CLI assets found (64 skills)
Doctor complete.`, 1)
    expect(result.level).toBe('error')
    expect(result.healthy).toBe(false)
    expect(result.canFix).toBe(false)
  })
})

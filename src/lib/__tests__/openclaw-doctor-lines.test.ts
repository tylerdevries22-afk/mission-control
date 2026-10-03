import { describe, expect, it } from 'vitest'
import { collectDoctorBullets } from '@/lib/openclaw-doctor-lines'
import { parseOpenClawDoctorOutput } from '@/lib/openclaw-doctor'

describe('wrapped doctor findings', () => {
  it('retains the complete legacy-session warning and repair instruction', () => {
    const result = parseOpenClawDoctorOutput(`◇ Doctor warnings ─────╮
│ - Legacy session bindings or retired session model-route state │
│   detected. Run openclaw doctor --fix to repair the bindings.   │
│ - Affected sessions: 2.                                       │
╰───────────────────────────────────────────────────────────────╯`)
    expect(result.category).toBe('state')
    expect(result.issues).toEqual([
      'Legacy session bindings or retired session model-route state detected. Run openclaw doctor --fix to repair the bindings.',
      'Affected sessions: 2.',
    ])
  })

  it('does not merge another section or an unindented instruction', () => {
    expect(collectDoctorBullets(`- Gateway PATH missing
  required directories.
Run: openclaw doctor --fix
◇ Security
- Channel requires authentication`)).toEqual([
      'Gateway PATH missing required directories.', 'Channel requires authentication',
    ])
  })

  it('ignores the explicit browser-discovery skip note while keeping real findings', () => {
    const result = parseOpenClawDoctorOutput(`- System browser profile discovery skipped by Doctor
  because cookie import is disabled.
- Gateway service PATH is missing required dirs.`)
    expect(result.issues).toEqual(['Gateway service PATH is missing required dirs.'])
  })

  it('handles ANSI colors and CRLF, and accepts output without bullets', () => {
    expect(collectDoctorBullets('\u001b[33m│  - Warning\u001b[0m\r\n│    continued\r\n│')).toEqual(['Warning continued'])
    expect(collectDoctorBullets('OK: configuration valid')).toEqual([])
  })
})

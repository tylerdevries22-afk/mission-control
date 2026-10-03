import { describe, expect, it } from 'vitest'
import { parseOpenClawDoctorOutput } from '@/lib/openclaw-doctor'

describe('informational OpenClaw doctor output', () => {
  it('ignores informational Codex, OAuth-skip, and browser cookie notes', () => {
    const result = parseOpenClawDoctorOutput(`
┌  OpenClaw doctor
◇  Doctor info
- Personal Codex CLI assets found (64 skills, 51 plugins, 1 config file) in ~/.codex
- To review or promote them: install the Codex plugin (openclaw plugins install npm:@openclaw/codex)
◇  State integrity
- OAuth dir not present (~/.openclaw/credentials). Skipping create because no WhatsApp/pairing channel config is active.
◇  Browser
- System browser profile cookie import is enabled (browser.allowSystemProfileImport).
- Importable Chrome-family profile cookie databases found: 4.
- Doctor does not access the macOS Keychain; importing asks for consent separately.
Fix: set commands.ownerAllowFrom to your channel user id
└  Doctor complete.
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.issues).toEqual([])
  })

  it('ignores unused session-logs skill tips and doctor-complete', () => {
    const result = parseOpenClawDoctorOutput(`
┌  OpenClaw doctor
◇  Skills
│  Agent "claude-20x":
│  1 allowed skill is not usable in this environment (missing binaries).
│  - session-logs
│  Disable unused skills: openclaw doctor --fix
└  Doctor complete.
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('treats positive security lines as healthy, not warnings (#331)', () => {
    const result = parseOpenClawDoctorOutput(`
? Security
- No channel security warnings detected.
- Run: openclaw security audit --deep
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.issues).toEqual([])
  })

  it('still detects real security warnings alongside positive lines', () => {
    const result = parseOpenClawDoctorOutput(`
? Security
- Channel "public" has no auth configured.
- No channel security warnings detected.
- Run: openclaw security audit --deep
`, 0)

    expect(result.healthy).toBe(false)
    expect(result.level).toBe('warning')
    expect(result.issues).toEqual([
      'Channel "public" has no auth configured.',
    ])
  })

  it('treats boxed informational doctor notes as healthy', () => {
    const result = parseOpenClawDoctorOutput(`
┌  OpenClaw doctor
│
◇  Doctor info ────────────────────────────────────────────────────────────╮
│                                                                          │
│  - Personal Codex CLI assets found (64 skills, 52 plugins, 1 config      │
│    file, 0 hook files) in /Users/tylerdevries/.codex and                 │
│    /Users/tylerdevries/.agents/skills; native Codex-mode agents use      │
│    isolated per-agent homes and will not load them.                      │
│  - To review or promote them: install the Codex plugin (openclaw         │
│    plugins install npm:@openclaw/codex), then run openclaw migrate plan  │
│    codex.                                                                │
│                                                                          │
◇  Browser ─────────────────────────────────────────────────────────╮
│                                                                   │
│  - System browser profile cookie import is disabled               │
│    (browser.allowSystemProfileImport).                            │
│  - Importable Chrome-family profile cookie databases found: 4.    │
│  - Doctor does not access the macOS Keychain; importing asks for  │
│    consent separately.                                            │
│                                                                   │
└  Doctor complete.
[skills] Skill precedence collision: skill="obsidian" winner=openclaw-managed
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.level).toBe('healthy')
    expect(result.issues).toEqual([])
  })

  it('stays healthy when the Clack title is Doctor warnings but every bullet is informational', () => {
    const result = parseOpenClawDoctorOutput(`
◇  Doctor warnings
- Personal Codex CLI assets found (64 skills, 52 plugins, 1 config │
- To review or promote them: install the Codex plugin
- System browser profile cookie import is disabled │
- Importable Chrome-family profile cookie databases found: 4.
- Doctor does not access the macOS Keychain
└  Doctor complete.
`, 0)

    expect(result.healthy).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.canFix).toBe(false)
  })


})

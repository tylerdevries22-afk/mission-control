import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tempHome = ''

vi.mock('@/lib/config', () => ({
  config: {
    get homeDir() {
      return tempHome
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

describe('scanKimiSessions', () => {
  beforeEach(() => {
    vi.resetModules()
    tempHome = mkdtempSync(join(tmpdir(), 'mc-kimi-test-'))
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('joins session_index.jsonl with state.json', async () => {
    const sessionDir = join(tempHome, '.kimi-code', 'sessions', 'wd_dev', 'session_abc')
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(join(tempHome, '.kimi-code', 'session_index.jsonl'), `${JSON.stringify({
      sessionId: 'session_abc',
      sessionDir,
      workDir: '/Users/dev/actz-may',
    })}\n`)
    writeFileSync(join(sessionDir, 'state.json'), JSON.stringify({
      id: 'session_abc',
      cwd: '/Users/dev/actz-may',
      createdAt: Date.now() - 60_000,
      updatedAt: Date.now(),
      lastPrompt: 'review the fleet map',
      title: 'fleet review',
    }))

    const { scanKimiSessions } = await import('@/lib/kimi-sessions')
    const sessions = scanKimiSessions(10)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'session_abc',
      projectPath: '/Users/dev/actz-may',
      projectSlug: 'actz-may',
      model: 'kimi-code/k3',
      lastUserPrompt: 'review the fleet map',
      isActive: true,
    })
  })

  it('ignores kimi-claw sibling sessions', async () => {
    const clawDir = join(tempHome, '.kimi', 'kimi-claw', 'sessions', 'session_claw')
    mkdirSync(clawDir, { recursive: true })
    mkdirSync(join(tempHome, '.kimi-code'), { recursive: true })
    writeFileSync(join(tempHome, '.kimi-code', 'session_index.jsonl'), `${JSON.stringify({
      sessionId: 'session_claw',
      sessionDir: clawDir,
      workDir: '/tmp',
    })}\n`)

    const { scanKimiSessions } = await import('@/lib/kimi-sessions')
    expect(scanKimiSessions()).toEqual([])
  })
})

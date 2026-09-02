import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listSkillRoots } from '@/lib/skill-roots'

describe('listSkillRoots', () => {
  const originalHome = process.env.HOME
  let tempDir = ''

  afterEach(() => {
    process.env.HOME = originalHome
    delete process.env.MC_SKILLS_USER_AGENTS_DIR
    delete process.env.MC_SKILLS_USER_CODEX_DIR
    if (tempDir) {
      tempDir = ''
    }
  })

  it('dedupes product skill roots that symlink to the same tree', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'mc-skills-'))
    const canonical = path.join(tempDir, 'canonical')
    mkdirSync(path.join(canonical, 'demo'), { recursive: true })
    writeFileSync(path.join(canonical, 'demo', 'SKILL.md'), '# demo\n')
    const linked = path.join(tempDir, 'codex-skills')
    symlinkSync(canonical, linked)
    process.env.MC_SKILLS_USER_AGENTS_DIR = canonical
    process.env.MC_SKILLS_USER_CODEX_DIR = linked
    process.env.HOME = tempDir
    const roots = listSkillRoots()
    const sources = roots.map((root) => root.source)
    expect(sources).toContain('user-agents')
    expect(sources).not.toContain('user-codex')
  })
})

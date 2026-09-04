import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ISOLATED_CLAUDE_AGENTS = new Set(['claude-20x', 'claude-5x'])

/**
 * Pin headless Claude dispatch to a dedicated config dir only when that
 * directory already exists. Heal must never create it or rewrite oauthAccount.
 */
export function claudeConfigDirForAgent(name: string | null | undefined): string | undefined {
  if (!name || !ISOLATED_CLAUDE_AGENTS.has(name)) return undefined
  const dir = join(homedir(), `.${name}`)
  return existsSync(dir) ? dir : undefined
}

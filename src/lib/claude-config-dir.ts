import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CLAUDE_FLEET_PLANS } from './claude-fleet-plans'
import { asFleetAgentName } from './fleet-agents'

/**
 * Pin headless Claude dispatch to a dedicated config dir only when that
 * directory already exists. Heal must never create it or rewrite oauthAccount.
 */
export function claudeConfigDirForAgent(name: string | null | undefined): string | undefined {
  if (!name) return undefined
  const identity = asFleetAgentName(name)
  const plan = CLAUDE_FLEET_PLANS.find((entry) => entry.identity === identity)
  if (!plan) return undefined
  const dir = join(homedir(), plan.homeName)
  return existsSync(dir) ? dir : undefined
}

import { isFleetAgentName, type FleetAgentName } from '@/lib/fleet-agents'
import type { HandoffKind } from '@/lib/session-handoff'

const KIND_AGENT: Record<HandoffKind, FleetAgentName> = {
  'claude-code': 'claude-20x',
  'codex-cli': 'codex',
  grok: 'grok',
  kimi: 'kimi',
}

const ALIASES: Record<string, FleetAgentName> = {
  claude: 'claude-20x',
  'claude-1': 'claude-20x',
  'claude-2': 'claude-5x',
  gork: 'grok',
}

export function fleetAgentFromHandoff(kind: HandoffKind, agent?: string): FleetAgentName {
  const key = (agent || '').trim().toLowerCase()
  if (isFleetAgentName(key)) return key
  if (key && ALIASES[key]) return ALIASES[key]
  return KIND_AGENT[kind]
}

export function handoffKindFromAgent(agent: FleetAgentName): HandoffKind {
  if (agent === 'claude-20x' || agent === 'claude-5x') return 'claude-code'
  if (agent === 'codex') return 'codex-cli'
  return agent
}

export function sameHandoffSeat(sourceKind: HandoffKind, targetKind: HandoffKind, sourceAgent: string, targetAgent: string): boolean {
  return sourceKind === targetKind && sourceAgent === targetAgent
}

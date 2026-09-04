export const FLEET_AGENT_NAMES = ['claude-20x', 'claude-5x', 'codex', 'grok', 'kimi'] as const

export type FleetAgentName = (typeof FLEET_AGENT_NAMES)[number]

export function isFleetAgentName(value: string): value is FleetAgentName {
  return (FLEET_AGENT_NAMES as readonly string[]).includes(value)
}

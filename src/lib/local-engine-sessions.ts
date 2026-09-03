import { scanGrokSessions } from './grok-sessions'
import { scanKimiSessions } from './kimi-sessions'
import { logger } from './logger'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function formatAge(timestamp: number): string {
  if (!timestamp) return '-'
  const diff = Date.now() - timestamp
  if (diff <= 0) return 'now'
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

function mapEngineRow(kind: 'grok' | 'kimi', row: {
  sessionId: string
  projectSlug: string
  projectPath: string | null
  model: string | null
  userMessages: number
  assistantMessages: number
  inputTokens: number
  outputTokens: number
  firstMessageAt: string | null
  lastMessageAt: string | null
  lastUserPrompt: string | null
  title?: string | null
  isActive: boolean
}) {
  const lastMsg = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : 0
  const firstMsg = row.firstMessageAt ? new Date(row.firstMessageAt).getTime() : 0
  return {
    id: row.sessionId,
    key: row.projectSlug || row.sessionId,
    agent: kind,
    kind,
    age: row.isActive ? 'now' : formatAge(lastMsg),
    model: row.model || kind,
    tokens: `${formatTokens(row.inputTokens || 0)}/${formatTokens(row.outputTokens || 0)}`,
    channel: 'local',
    flags: [],
    active: row.isActive,
    startTime: firstMsg,
    lastActivity: row.isActive ? Date.now() : lastMsg,
    source: 'local' as const,
    userMessages: row.userMessages,
    assistantMessages: row.assistantMessages,
    lastUserPrompt: row.lastUserPrompt,
    title: row.title || row.lastUserPrompt,
    workingDir: row.projectPath,
  }
}

export function getLocalGrokSessions() {
  try {
    return scanGrokSessions(100).map((row) => mapEngineRow('grok', row))
  } catch (err) {
    logger.warn({ err }, 'Failed to read local Grok sessions')
    return []
  }
}

export function getLocalKimiSessions() {
  try {
    return scanKimiSessions(100).map((row) => mapEngineRow('kimi', row))
  } catch (err) {
    logger.warn({ err }, 'Failed to read local Kimi sessions')
    return []
  }
}

import { join } from 'node:path'
import { config } from './config'
import { findNamedJsonl, readJsonlTailLines } from './jsonl-tail'
import { isNoiseUserText, pushMessage, textPart, type TranscriptMessage } from './session-transcript-types'

function rec(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function findClaudeTranscriptFile(sessionId: string, root = join(config.claudeHome, 'projects')): string | null {
  return findNamedJsonl(root, sessionId)
}

export function parseClaudeTranscriptLines(lines: string[], sessionId: string, limit: number): TranscriptMessage[] {
  const out: TranscriptMessage[] = []
  for (const line of lines) {
    if (line.length > 80_000) continue
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const entry = rec(parsed)
    if (!entry || str(entry.sessionId) !== sessionId || entry.isSidechain) continue
    const ts = str(entry.timestamp) || undefined
    if (entry.type === 'user') parseUser(entry, out, ts)
    else if (entry.type === 'assistant') parseAssistant(entry, out, ts)
  }
  return out.slice(-Math.max(1, limit))
}

export function readClaudeTranscript(sessionId: string, limit: number): TranscriptMessage[] {
  const file = findClaudeTranscriptFile(sessionId)
  if (!file) return []
  return parseClaudeTranscriptLines(readJsonlTailLines(file), sessionId, limit)
}

function parseUser(entry: Record<string, unknown>, out: TranscriptMessage[], ts?: string) {
  const message = rec(entry.message)
  const raw = message?.content
  if (Array.isArray(raw) && raw.some((block) => rec(block)?.type === 'tool_result')) {
    const parts = raw.flatMap((block) => {
      const item = rec(block)
      if (!item || item.type !== 'tool_result') return []
      const content = typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.content)
          ? item.content.map((part) => rec(part)?.text || '').join('\n')
          : ''
      const text = String(content).trim()
      return text ? [{ type: 'tool_result' as const, toolUseId: str(item.tool_use_id), content: text.slice(0, 8000), isError: item.is_error === true }] : []
    })
    pushMessage(out, 'system', parts, ts)
    return
  }
  const content = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw.map((block) => str(rec(block)?.text)).join('\n')
      : ''
  if (isNoiseUserText(content)) return
  const part = textPart(content)
  if (part) pushMessage(out, 'user', [part], ts)
}

function parseAssistant(entry: Record<string, unknown>, out: TranscriptMessage[], ts?: string) {
  const message = rec(entry.message)
  const raw = message?.content
  if (!Array.isArray(raw)) return
  const parts = raw.flatMap((block) => {
    const item = rec(block)
    if (!item) return []
    if (item.type === 'thinking' && str(item.thinking).trim()) {
      return [{ type: 'thinking' as const, thinking: str(item.thinking).trim().slice(0, 4000) }]
    }
    if (item.type === 'text') {
      const part = textPart(str(item.text))
      return part ? [part] : []
    }
    if (item.type === 'tool_use') {
      return [{ type: 'tool_use' as const, id: str(item.id), name: str(item.name) || 'unknown', input: JSON.stringify(item.input || {}).slice(0, 500) }]
    }
    return []
  })
  pushMessage(out, 'assistant', parts, ts)
}

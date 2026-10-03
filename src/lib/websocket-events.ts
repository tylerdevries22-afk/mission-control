import { useMissionControl, type ChatMessage } from '@/store'
import { applyGatewayApproval } from '@/lib/websocket-approvals'
import { applyGatewaySessionSnapshot } from '@/lib/websocket-sessions'
import { jsonValue, numeric, record, text } from '@/lib/websocket-value'
import type { GatewayFrame } from '@/lib/websocket-frame'

export function applyGatewayEvent(frame: GatewayFrame) {
  const store = useMissionControl.getState()
  const data = record(frame.payload) || (frame.event === 'context.compaction' || frame.event === 'model.fallback' ? {} : null)
  if (frame.event === 'tick') {
    applyGatewaySessionSnapshot(data?.snapshot)
    return
  }
  if (!data || !frame.event) return
  if (applyGatewayApproval(frame.event, data)) return
  switch (frame.event) {
    case 'log': {
      const level = text(data.level)
      store.addLog({
        id: text(data.id) || `log-${Date.now()}-${Math.random()}`,
        timestamp: numeric(data.timestamp) || Date.now(),
        level: level === 'warn' || level === 'error' || level === 'debug' ? level : 'info',
        source: text(data.source) || 'gateway', session: text(data.session),
        message: text(data.message) || '', data: jsonValue(data.extra || data.data),
      })
      break
    }
    case 'chat.message': {
      const id = numeric(data.id), conversation = text(data.conversation_id), from = text(data.from_agent)
      if (id === undefined || !conversation || !from) return
      const kind = text(data.message_type)
      const messageType: ChatMessage['message_type'] = kind === 'system' || kind === 'handoff' || kind === 'status'
        || kind === 'command' || kind === 'tool_call' ? kind : 'text'
      store.addChatMessage({
        id, conversation_id: conversation, from_agent: from, to_agent: text(data.to_agent) || null,
        content: text(data.content) || '', message_type: messageType, metadata: jsonValue(data.metadata),
        read_at: numeric(data.read_at), created_at: numeric(data.created_at) || Math.floor(Date.now() / 1000),
      })
      break
    }
    case 'notification':
      store.addNotification({
        id: numeric(data.id) ?? Date.now(), recipient: text(data.recipient) || 'operator',
        type: text(data.type) || 'info', title: text(data.title) || '', message: text(data.message) || '',
        source_type: text(data.source_type), source_id: numeric(data.source_id),
        created_at: numeric(data.created_at) || Math.floor(Date.now() / 1000),
      })
      break
    case 'agent.status': {
      const id = numeric(data.id), status = text(data.status)
      if (id !== undefined && (status === 'offline' || status === 'idle' || status === 'busy' || status === 'error')) {
        store.updateAgent(id, { status, last_seen: numeric(data.last_seen), last_activity: text(data.last_activity) })
      }
      break
    }
    case 'tool.stream':
      store.addChatMessage({
        id: numeric(data.id) || -(Date.now() + Math.random()),
        conversation_id: text(data.conversation_id) || text(data.sessionId) || 'tool-stream',
        from_agent: text(data.agentName) || text(data.agent) || 'agent', to_agent: null, content: '', message_type: 'tool_call',
        metadata: { toolName: text(data.toolName) || text(data.name), toolArgs: jsonValue(data.args || data.toolArgs),
          toolOutput: jsonValue(data.output || data.toolOutput), toolStatus: text(data.status) || 'success', durationMs: numeric(data.durationMs) },
        created_at: Math.floor((numeric(data.timestamp) || Date.now()) / 1000),
      })
      break
    case 'context.compaction':
    case 'model.fallback': {
      const fallback = frame.event === 'model.fallback'
      store.addNotification({
        id: Date.now(), recipient: 'operator', type: fallback ? 'warning' : 'info',
        title: fallback ? 'Model Fallback' : 'Context Compaction',
        message: text(data.message) || (fallback
          ? `Fell back from ${text(data.from) || '?'} to ${text(data.to) || '?'}`
          : `Session context compacted (${numeric(data.percentage) ?? '?'}% reduced)`),
        created_at: Math.floor(Date.now() / 1000),
      })
    }
  }
}

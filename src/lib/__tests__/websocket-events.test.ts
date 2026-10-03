import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyGatewayEvent } from '@/lib/websocket-events'

const store = vi.hoisted(() => ({ setSessions: vi.fn(), addLog: vi.fn(), addChatMessage: vi.fn(),
  addNotification: vi.fn(), updateAgent: vi.fn(), addExecApproval: vi.fn(), updateExecApproval: vi.fn() }))
vi.mock('@/store', () => ({ useMissionControl: { getState: () => store } }))
beforeEach(() => { vi.clearAllMocks() })
const emit = (event: string, payload?: unknown) => applyGatewayEvent({ type: 'event', event, payload })

describe('gateway event adapters', () => {
  it('maps session snapshots while rejecting malformed entries', () => {
    emit('tick', { snapshot: { sessions: [null, { sessionId: 'test-session', key: 'agent:test',
      updatedAt: Date.now(), model: { primary: 'test-model' }, totalTokens: 100, contextTokens: 200 }] } })
    expect(store.setSessions).toHaveBeenCalledWith([expect.objectContaining({
      id: 'test-session', key: 'agent:test', model: 'test-model', tokens: '100/200', active: true, source: 'gateway',
    })])
    emit('tick', { snapshot: { sessions: 'invalid' } })
    expect(store.setSessions).toHaveBeenCalledTimes(1)
  })

  it('maps logs, chat and notifications with safe types', () => {
    emit('log', { message: 'test log', level: 'warn', extra: { count: 1 } })
    expect(store.addLog).toHaveBeenCalledWith(expect.objectContaining({ message: 'test log', level: 'warn', data: { count: 1 } }))
    emit('chat.message', { id: 7, conversation_id: 'test', from_agent: 'worker', content: 'Hello', message_type: 'system' })
    expect(store.addChatMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 7, conversation_id: 'test', message_type: 'system' }))
    emit('chat.message', { id: {}, content: 'invalid' })
    expect(store.addChatMessage).toHaveBeenCalledTimes(1)
    emit('notification', { id: 8, title: 'Test', message: 'Notice' })
    expect(store.addNotification).toHaveBeenCalledWith(expect.objectContaining({ id: 8, title: 'Test', recipient: 'operator' }))
  })

  it('retains agent status and tool-stream updates', () => {
    emit('agent.status', { id: 7, status: 'busy', last_activity: 'Working' })
    expect(store.updateAgent).toHaveBeenCalledWith(7, expect.objectContaining({ status: 'busy', last_activity: 'Working' }))
    emit('agent.status', { id: 7, status: 'invalid' })
    expect(store.updateAgent).toHaveBeenCalledTimes(1)
    emit('tool.stream', { sessionId: 'test', toolName: 'read', args: { path: 'test.txt' }, status: 'success' })
    expect(store.addChatMessage).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'test', message_type: 'tool_call',
      metadata: expect.objectContaining({ toolName: 'read', toolArgs: { path: 'test.txt' }, toolStatus: 'success' }) }))
  })

  it('retains compaction and fallback notices when optional payloads are absent', () => {
    emit('context.compaction'); emit('model.fallback')
    expect(store.addNotification).toHaveBeenNthCalledWith(1, expect.objectContaining({ title: 'Context Compaction' }))
    expect(store.addNotification).toHaveBeenNthCalledWith(2, expect.objectContaining({ title: 'Model Fallback' }))
  })

  it.each(['exec.approval', 'exec.approval.requested'])('maps nested approval requests: %s', event => {
    emit(event, { id: 'test-approval', request: { command: 'pwd', cwd: '/tmp', sessionKey: 'test', agentId: 'worker' },
      createdAtMs: 1000, expiresAtMs: 2000 })
    expect(store.addExecApproval).toHaveBeenCalledWith(expect.objectContaining({ id: 'test-approval', sessionId: 'test',
      toolName: 'pwd', command: 'pwd', cwd: '/tmp', status: 'pending', createdAt: 1000, expiresAt: 2000 }))
    expect(store.addNotification).toHaveBeenCalledWith(expect.objectContaining({ title: 'Exec Approval Required' }))
  })

  it('accepts known resolution decisions and rejects malformed resolutions', () => {
    emit('exec.approval.resolved', { id: 'test', decision: 'deny' })
    expect(store.updateExecApproval).toHaveBeenLastCalledWith('test', { status: 'denied' })
    emit('exec.approval.resolved', { id: 'test', decision: 'allow-once' })
    expect(store.updateExecApproval).toHaveBeenLastCalledWith('test', { status: 'approved' })
    emit('exec.approval.resolved', { id: 'test', decision: null })
    expect(store.updateExecApproval).toHaveBeenCalledTimes(2)
  })

  it('ignores unknown events and malformed event data', () => {
    emit('unknown', { test: true }); emit('log', null)
    expect(store.addLog).not.toHaveBeenCalled(); expect(store.addNotification).not.toHaveBeenCalled()
  })
})

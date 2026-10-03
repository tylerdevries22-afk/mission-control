import { useMissionControl, type ExecApprovalRequest } from '@/store'
import { jsonRecord, numeric, record, text } from '@/lib/websocket-value'

export function applyGatewayApproval(event: string, data: Record<string, unknown>): boolean {
  const store = useMissionControl.getState()
  const id = text(data.id)
  if (event === 'exec.approval.resolved') {
    const decision = data.decision
    if (id && (decision === 'deny' || decision === 'allow-once' || decision === 'allow-always')) {
      store.updateExecApproval(id, { status: decision === 'deny' ? 'denied' : 'approved' })
    }
    return true
  }
  if (event !== 'exec.approval' && event !== 'exec.approval.requested') return false
  if (!id) return true
  const request = record(data.request) || data
  const risk = text(data.risk)
  const safeRisk: ExecApprovalRequest['risk'] = risk === 'low' || risk === 'high' || risk === 'critical' ? risk : 'medium'
  store.addExecApproval({
    id, sessionId: text(request.sessionKey) || text(data.sessionId) || '',
    agentName: text(request.agentId) || text(data.agentName),
    toolName: text(data.toolName) || text(data.name) || text(request.command) || 'unknown',
    toolArgs: jsonRecord(data.args || data.toolArgs), command: text(request.command) || text(data.command),
    cwd: text(request.cwd) || text(data.cwd), host: text(request.host) || text(data.host),
    resolvedPath: text(request.resolvedPath) || text(data.resolvedPath), risk: safeRisk,
    createdAt: numeric(data.createdAtMs) || numeric(data.createdAt) || Date.now(),
    expiresAt: numeric(data.expiresAtMs) || numeric(data.expiresAt), status: 'pending',
  })
  store.addNotification({
    id: Date.now(), recipient: 'operator', type: 'warning', title: 'Exec Approval Required',
    message: `${text(request.agentId) || text(data.agentName) || 'Agent'} wants to run: ${text(request.command) || text(data.toolName) || text(data.name) || 'tool'}`,
    created_at: Math.floor(Date.now() / 1000),
  })
  return true
}

import { getDefaultWorkspaceContext } from './auth-context'
import { extractApiKeyFromHeaders, matchesGlobalApiKey, resolveAuthExtension } from './auth-keys'
import { resolveAgentKey } from './auth-agent-key'
import { resolveProxyUser } from './auth-proxy'
import { validateSession } from './auth-sessions'
import { parseMcSessionCookieHeader } from './session-cookie'
import { logSecurityEvent } from './security-events'
import type { User } from './auth-types'

export function getUserFromRequest(request: Request): User | null {
  // Extract agent identity header (optional, for attribution)
  const agentName = (request.headers.get('x-agent-name') || '').trim() || null

  // Proxy / trusted-header auth (MC_PROXY_AUTH_HEADER)
  // When the gateway has already authenticated the user and injects their username
  // as a trusted header (e.g. X-Auth-Username from Envoy OIDC claimToHeaders),
  // skip the local login form entirely.
  // Requires MC_PROXY_AUTH_TRUSTED_IPS — without it, proxy auth is disabled
  // and a critical security event is logged on the first request.
  const proxyUser = resolveProxyUser(request, agentName)
  if (proxyUser) return proxyUser

  // Check session cookie
  const cookieHeader = request.headers.get('cookie') || ''
  const sessionToken = parseMcSessionCookieHeader(cookieHeader)
  if (sessionToken) {
    const user = validateSession(sessionToken)
    if (user) return { ...user, agent_name: agentName }
  }

  // Check API key - DB override first, then env var
  const apiKey = extractApiKeyFromHeaders(request.headers)

  if (apiKey && matchesGlobalApiKey(apiKey)) {
    // FR-D2: Log warning when global admin API key is used.
    // Prefer agent-scoped keys (POST /api/agents/{id}/keys) for least-privilege access.
    try {
      logSecurityEvent({
        event_type: 'global_api_key_used',
        severity: 'info',
        source: 'auth',
        agent_name: agentName || undefined,
        detail: JSON.stringify({ hint: 'Consider using agent-scoped API keys for least-privilege access' }),
        ip_address: request.headers.get('x-real-ip') || 'unknown',
        workspace_id: getDefaultWorkspaceContext().workspaceId,
        tenant_id: getDefaultWorkspaceContext().tenantId,
      })
    } catch { /* startup race */ }
    return {
      id: 0,
      username: 'api',
      display_name: 'API Access',
      role: 'admin',
      workspace_id: getDefaultWorkspaceContext().workspaceId,
      tenant_id: getDefaultWorkspaceContext().tenantId,
      created_at: 0,
      updated_at: 0,
      last_login_at: null,
      agent_name: agentName,
    }
  }

  const agentUser = apiKey ? resolveAgentKey(apiKey, agentName) : null
  if (agentUser) return agentUser
  // Reserved agent keys cannot be revived by an extension after scoped auth denies them.
  if (apiKey?.startsWith('mca_')) return null

  return apiKey ? resolveAuthExtension(apiKey, agentName) : null
}

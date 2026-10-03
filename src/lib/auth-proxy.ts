import { randomBytes } from 'node:crypto'
import { getDatabase } from './db'
import { createUser } from './auth-users'
import { getDefaultWorkspaceContext, resolveTenantForWorkspace } from './auth-context'
import { logSecurityEvent } from './security-events'
import { extractClientIpFromTrusted } from './request'
import { safeCompare } from './auth-keys'
import type { User, UserQueryRow } from './auth-types'

// Trusted IPs for proxy auth header (comma-separated)
const PROXY_AUTH_TRUSTED_IPS = new Set(
  (process.env.MC_PROXY_AUTH_TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
)

// Log once at startup if proxy auth is misconfigured.
// Deferred to avoid DB access during module initialization.
let _proxyAuthMisconfigWarned = false
function warnProxyAuthMisconfigOnce(): void {
  if (_proxyAuthMisconfigWarned) return
  _proxyAuthMisconfigWarned = true
  try {
    logSecurityEvent({
      event_type: 'proxy_auth_misconfigured',
      severity: 'critical',
      source: 'auth',
      detail: JSON.stringify({
        reason: 'Proxy auth requires trusted IPs and MC_PROXY_AUTH_SECRET with at least 32 characters; otherwise it is disabled',
      }),
      workspace_id: 1,
      tenant_id: 1,
    })
  } catch {}
}
function resolveOrProvisionProxyUser(username: string): User | null {
  try {
    const db = getDatabase()
    const { workspaceId } = getDefaultWorkspaceContext()

    const row = db.prepare(`
      SELECT u.id, u.username, u.display_name, u.role, u.workspace_id,
             COALESCE(w.tenant_id, 1) as tenant_id,
             u.provider, u.email, u.avatar_url, u.is_approved,
             u.created_at, u.updated_at, u.last_login_at
      FROM users u
      LEFT JOIN workspaces w ON w.id = u.workspace_id
      WHERE u.username = ?
    `).get(username) as UserQueryRow | undefined

    if (row) {
      if ((row.is_approved ?? 1) !== 1) return null
      return {
        id: row.id,
        username: row.username,
        display_name: row.display_name,
        role: row.role,
        workspace_id: row.workspace_id || workspaceId,
        tenant_id: resolveTenantForWorkspace(row.workspace_id || workspaceId),
        provider: row.provider || 'local',
        email: row.email ?? null,
        avatar_url: row.avatar_url ?? null,
        is_approved: row.is_approved ?? 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_login_at: row.last_login_at,
      }
    }

    // Auto-provision if MC_PROXY_AUTH_DEFAULT_ROLE is configured
    const defaultRole = (process.env.MC_PROXY_AUTH_DEFAULT_ROLE || '').trim()
    if (!defaultRole || !(['viewer', 'operator', 'admin'] as const).includes(defaultRole as User['role'])) {
      return null
    }

    // Random password — proxy users cannot log in via the local login form
    return createUser(username, randomBytes(32).toString('hex'), username, defaultRole as User['role'])
  } catch {
    return null
  }
}

export function resolveProxyUser(request: Request, agentName: string | null): User | null {
  const proxyAuthHeader = (process.env.MC_PROXY_AUTH_HEADER || '').trim()
  if (proxyAuthHeader) {
    const secret = process.env.MC_PROXY_AUTH_SECRET || ''
    if (PROXY_AUTH_TRUSTED_IPS.size === 0 || secret.length < 32) {
      warnProxyAuthMisconfigOnce()
    } else {
      // Forwarded IPs alone cannot authenticate the peer in an App Router Request.
      // The proxy must overwrite this header with an environment-held secret.
      const presentedSecret = request.headers.get('x-mc-proxy-secret') || ''
      if (!safeCompare(presentedSecret, secret)) return null
      const clientIp = extractClientIpFromTrusted(request, PROXY_AUTH_TRUSTED_IPS, '')
      if (clientIp && PROXY_AUTH_TRUSTED_IPS.has(clientIp)) {
        const proxyUsername = (request.headers.get(proxyAuthHeader) || '').trim()
        if (proxyUsername) {
          const user = resolveOrProvisionProxyUser(proxyUsername)
          if (user) return { ...user, agent_name: agentName }
        }
      }
    }
  }

  return null
}

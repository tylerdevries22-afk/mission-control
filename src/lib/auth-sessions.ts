import { randomBytes } from 'node:crypto'
import { getDatabase } from './db'
import { getDefaultWorkspaceContext, resolveTenantForWorkspace } from './auth-context'
import { hashSessionToken } from './auth-keys'
import type { User, SessionQueryRow } from './auth-types'

const SESSION_DURATION = 7 * 24 * 60 * 60
export function createSession(
  userId: number,
  ipAddress?: string,
  userAgent?: string,
  workspaceId?: number
): { token: string; expiresAt: number } {
  const db = getDatabase()
  const token = randomBytes(32).toString('hex')
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + SESSION_DURATION
  const resolvedWorkspaceId = workspaceId ?? ((db.prepare('SELECT workspace_id FROM users WHERE id = ?').get(userId) as { workspace_id?: number } | undefined)?.workspace_id || getDefaultWorkspaceContext().workspaceId)
  const resolvedTenantId = resolveTenantForWorkspace(resolvedWorkspaceId)

  const tokenHash = hashSessionToken(token)
  db.prepare(`
    INSERT INTO user_sessions (token, user_id, expires_at, ip_address, user_agent, workspace_id, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt, ipAddress || null, userAgent || null, resolvedWorkspaceId, resolvedTenantId)

  // Update user's last login
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, userId)

  // Clean up expired sessions
  db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(now)

  return { token, expiresAt }
}

export function validateSession(token: string): (User & { sessionId: number }) | null {
  if (!token) return null
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  const tokenHash = hashSessionToken(token)

  const row = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.provider, u.email, u.avatar_url, u.is_approved,
           COALESCE(s.workspace_id, u.workspace_id, 1) as workspace_id,
           COALESCE(s.tenant_id, w.tenant_id, 1) as tenant_id,
           u.created_at, u.updated_at, u.last_login_at,
           s.id as session_id
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN workspaces w ON w.id = COALESCE(s.workspace_id, u.workspace_id, 1)
    WHERE s.token = ? AND s.expires_at > ?
  `).get(tokenHash, now) as SessionQueryRow | undefined

  if (!row) return null

  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    workspace_id: row.workspace_id || getDefaultWorkspaceContext().workspaceId,
    tenant_id: row.tenant_id || getDefaultWorkspaceContext().tenantId,
    provider: row.provider || 'local',
    email: row.email ?? null,
    avatar_url: row.avatar_url ?? null,
    is_approved: typeof row.is_approved === 'number' ? row.is_approved : 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
    sessionId: row.session_id,
  }
}

export function destroySession(token: string): void {
  const db = getDatabase()
  const tokenHash = hashSessionToken(token)
  db.prepare('DELETE FROM user_sessions WHERE token = ?').run(tokenHash)
}

export function destroyAllUserSessions(userId: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId)
}

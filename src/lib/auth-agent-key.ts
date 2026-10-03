import { getDatabase } from './db'
import { hashApiKey, parseAgentScopes, deriveRoleFromScopes } from './auth-keys'
import type { User } from './auth-types'

/** Resolve scoped keys from their workspace tenant; missing workspaces fail closed. */
export function resolveAgentKey(apiKey: string, agentName: string | null): User | null {
  try {
    const db = getDatabase()
    const keyHash = hashApiKey(apiKey)
    const now = Math.floor(Date.now() / 1000)
    const row = db.prepare(`
      SELECT k.id, k.agent_id, k.workspace_id, k.scopes, k.expires_at, k.revoked_at, w.tenant_id
      FROM agent_api_keys k
      JOIN workspaces w ON w.id = k.workspace_id
      WHERE k.key_hash = ?
      LIMIT 1
    `).get(keyHash) as {
      id: number
      agent_id: number
      workspace_id: number
      tenant_id: number
      scopes: string
      expires_at: number | null
      revoked_at: number | null
    } | undefined

    if (row && Number.isSafeInteger(row.tenant_id) && row.tenant_id > 0 && !row.revoked_at && (!row.expires_at || row.expires_at > now)) {
      const scopes = parseAgentScopes(row.scopes)
      const agent = db
        .prepare('SELECT id, name FROM agents WHERE id = ? AND workspace_id = ?')
        .get(row.agent_id, row.workspace_id) as { id: number; name: string } | undefined

      if (agent) {
        if (agentName && agentName !== agent.name && !scopes.has('admin')) {
          return null
        }

        db.prepare('UPDATE agent_api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id)

        return {
          id: -row.id,
          username: `agent:${agent.name}`,
          display_name: agent.name,
          role: deriveRoleFromScopes(scopes),
          workspace_id: row.workspace_id,
          tenant_id: row.tenant_id,
          created_at: 0,
          updated_at: now,
          last_login_at: now,
          agent_name: agent.name,
          agent_id: agent.id,
        }
      }
    }
  } catch {
    // A failed key lookup must not authenticate the request.
  }
  return null
}

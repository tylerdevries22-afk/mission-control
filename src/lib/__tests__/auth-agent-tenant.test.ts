import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUserFromRequest, hashApiKey, registerAuthResolver } from '@/lib/auth'
import { listWorkspacesForTenant } from '@/lib/workspaces'
import { resolveAgentKey } from '@/lib/auth-agent-key'

const fixture = vi.hoisted(() => ({ db: null as Database.Database | null }))
vi.mock('@/lib/db', () => ({ getDatabase: () => fixture.db }))
vi.mock('@/lib/security-events', () => ({ logSecurityEvent: vi.fn() }))

const key = `mca_${'a'.repeat(48)}`
const request = (name?: string) => new Request('http://localhost/api/workspaces', {
  headers: { 'x-api-key': key, ...(name ? { 'x-agent-name': name } : {}) },
})

beforeEach(() => {
  vi.stubEnv('API_KEY', 'separate-global-test-key')
  fixture.db = new Database(':memory:')
  fixture.db.exec(`
    CREATE TABLE settings (key TEXT, value TEXT);
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, tenant_id INTEGER, slug TEXT, name TEXT,
      brand TEXT, isolation TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE agents (id INTEGER PRIMARY KEY, workspace_id INTEGER, name TEXT);
    CREATE TABLE agent_api_keys (id INTEGER PRIMARY KEY, agent_id INTEGER, workspace_id INTEGER,
      scopes TEXT, expires_at INTEGER, revoked_at INTEGER, key_hash TEXT, last_used_at INTEGER, updated_at INTEGER);
    INSERT INTO workspaces VALUES (1,10,'default','Tenant A',NULL,'strict',1,1),
      (2,20,'other','Tenant B',NULL,'strict',1,1);
    INSERT INTO agents VALUES (7,2,'worker-b');
  `)
  fixture.db.prepare('INSERT INTO agent_api_keys (id,agent_id,workspace_id,scopes,key_hash) VALUES (1,7,2,?,?)')
    .run(JSON.stringify(['operator']), hashApiKey(key))
})

afterEach(() => {
  fixture.db?.close()
  fixture.db = null
  registerAuthResolver(() => null)
  vi.unstubAllEnvs()
})

describe('agent key tenant isolation', () => {
  it('binds the user and workspace listing to the key workspace tenant', () => {
    const user = getUserFromRequest(request())
    expect(user).toMatchObject({ workspace_id: 2, tenant_id: 20, agent_id: 7, role: 'operator' })
    if (!user || !fixture.db) throw new Error('Expected authenticated fixture')
    expect(listWorkspacesForTenant(fixture.db, user.tenant_id).map(workspace => workspace.id)).toEqual([2])
  })

  it('fails closed when the key workspace is missing', () => {
    fixture.db?.prepare('DELETE FROM workspaces WHERE id=2').run()
    expect(getUserFromRequest(request())).toBeNull()
  })

  it.each(['revoked_at', 'expires_at'])('denies %s keys', column => {
    if (column === 'revoked_at') fixture.db?.prepare('UPDATE agent_api_keys SET revoked_at=1').run()
    else fixture.db?.prepare('UPDATE agent_api_keys SET expires_at=1').run()
    expect(getUserFromRequest(request())).toBeNull()
  })

  it('does not let an extension override an agent identity mismatch', () => {
    registerAuthResolver(() => ({ id: 0, username: 'extension', display_name: 'Extension', role: 'admin',
      workspace_id: 1, tenant_id: 10, created_at: 0, updated_at: 0, last_login_at: null }))
    expect(getUserFromRequest(request('different-agent'))).toBeNull()
  })

  it('allows the bound agent and records use only after successful auth', () => {
    expect(resolveAgentKey(key, 'worker-b')).toMatchObject({ tenant_id: 20, agent_name: 'worker-b' })
    const used = fixture.db?.prepare('SELECT last_used_at FROM agent_api_keys WHERE id=1').get()
    expect(used).toMatchObject({ last_used_at: expect.any(Number) })
  })
})

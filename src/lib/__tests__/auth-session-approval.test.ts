import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSession, destroyAllUserSessions, destroySession, validateSession } from '@/lib/auth'

const fixture = vi.hoisted(() => ({ db: null as Database.Database | null }))
vi.mock('@/lib/db', () => ({ getDatabase: () => fixture.db }))
vi.mock('@/lib/security-events', () => ({ logSecurityEvent: vi.fn() }))

beforeEach(() => {
  fixture.db = new Database(':memory:')
  fixture.db.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, tenant_id INTEGER, slug TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, display_name TEXT, role TEXT,
      provider TEXT, email TEXT, avatar_url TEXT, is_approved INTEGER, workspace_id INTEGER,
      created_at INTEGER, updated_at INTEGER, last_login_at INTEGER);
    CREATE TABLE user_sessions (id INTEGER PRIMARY KEY, token TEXT, user_id INTEGER, workspace_id INTEGER,
      tenant_id INTEGER, expires_at INTEGER, created_at INTEGER, ip_address TEXT, user_agent TEXT);
    INSERT INTO workspaces VALUES (2,20,'default');
    INSERT INTO users (id,username,display_name,role,is_approved,workspace_id,created_at,updated_at)
      VALUES (7,'test-user','Test','operator',1,2,1,1);
  `)
})

afterEach(() => { fixture.db?.close(); fixture.db = null })

describe('session approval and revocation', () => {
  it('rejects an existing session immediately after the account loses approval', () => {
    const { token } = createSession(7)
    expect(validateSession(token)).toMatchObject({ id: 7, workspace_id: 2, tenant_id: 20 })
    fixture.db?.prepare('UPDATE users SET is_approved=0 WHERE id=7').run()
    expect(validateSession(token)).toBeNull()
  })

  it('stores a hash and rejects raw, unknown or expired session identities', () => {
    const { token } = createSession(7)
    const stored = fixture.db?.prepare('SELECT token FROM user_sessions').get() as { token: string }
    expect(stored.token).not.toBe(token)
    expect(validateSession(stored.token)).toBeNull()
    expect(validateSession('unknown-session')).toBeNull()
    fixture.db?.prepare('UPDATE user_sessions SET expires_at=1').run()
    expect(validateSession(token)).toBeNull()
  })

  it('supports individual and account-wide session revocation', () => {
    const first = createSession(7)
    const second = createSession(7)
    destroySession(first.token)
    expect(validateSession(first.token)).toBeNull()
    expect(validateSession(second.token)).not.toBeNull()
    destroyAllUserSessions(7)
    expect(validateSession(second.token)).toBeNull()
  })
})

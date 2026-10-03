import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const fixture = vi.hoisted(() => ({
  authenticate: vi.fn(), getUser: vi.fn(), update: vi.fn(), session: vi.fn(),
  audit: vi.fn(), password: vi.fn(), storedUser: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  authenticateUser: fixture.authenticate, getUserFromRequest: fixture.getUser,
  updateUser: fixture.update, createSession: fixture.session, requireRole: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ logAuditEvent: fixture.audit, needsFirstTimeSetup: () => false,
  getDatabase: () => ({ prepare: () => ({ get: fixture.storedUser }) }) }))
vi.mock('@/lib/password', () => ({ verifyPassword: fixture.password }))
vi.mock('@/lib/rate-limit', () => ({ loginLimiter: () => null, passwordChangeLimiter: () => null }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { POST } from '@/app/api/auth/login/route'
import { PATCH } from '@/app/api/auth/me/route'

const user = { id: 1, username: 'user', display_name: 'User', role: 'viewer', workspace_id: 2, tenant_id: 4 }
function request(path: string, body: unknown, method: string) {
  return new NextRequest(`http://localhost/api/auth/${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  fixture.getUser.mockReturnValue(user)
  fixture.authenticate.mockReturnValue(user)
  fixture.update.mockReturnValue(user)
  fixture.session.mockReturnValue({ token: 'fixture-session', expiresAt: 9999999999 })
  fixture.storedUser.mockReturnValue({ password_hash: 'fixture-hash' })
  fixture.password.mockReturnValue(true)
})

describe('credential HTTP boundaries', () => {
  it.each([null, [], {}, { username: {}, password: 'value' }, { username: 'user', password: 123 },
    { username: 'a'.repeat(101), password: 'value' }, { username: 'user', password: 'a'.repeat(1025) }])(
    'rejects malformed login input before hashing or auditing: %o', async body => {
      const response = await POST(request('login', body, 'POST'))
      expect(response.status).toBe(400)
      expect(fixture.authenticate).not.toHaveBeenCalled()
      expect(fixture.audit).not.toHaveBeenCalled()
    },
  )

  it('retains valid login and session cookie issuance', async () => {
    const response = await POST(request('login', { username: 'user', password: 'valid-password' }, 'POST'))
    expect(response.status).toBe(200)
    expect(fixture.authenticate).toHaveBeenCalledWith('user', 'valid-password')
    expect(response.headers.get('set-cookie')).toContain('mc-session=fixture-session')
  })

  it.each([{ display_name: {} }, { display_name: '   ' }, { new_password: ['wrong'] },
    { new_password: 'weak', current_password: 'old' }, { new_password: 'a'.repeat(1025), current_password: 'old' },
    { new_password: 'valid-password', current_password: 123 }, { new_password: 'valid-password' }, { role: 'admin' }])(
    'rejects malformed profile input before checking passwords or mutating: %o', async body => {
      const response = await PATCH(request('me', body, 'PATCH'))
      expect(response.status).toBe(400)
      expect(fixture.password).not.toHaveBeenCalled()
      expect(fixture.update).not.toHaveBeenCalled()
      expect(fixture.session).not.toHaveBeenCalled()
    },
  )

  it('updates a trimmed display name without creating a session', async () => {
    const response = await PATCH(request('me', { display_name: ' New Name ', new_password: '' }, 'PATCH'))
    expect(response.status).toBe(200)
    expect(fixture.update).toHaveBeenCalledWith(1, { display_name: 'New Name' })
    expect(fixture.session).not.toHaveBeenCalled()
  })

  it('checks the current password and issues a new cookie after the atomic update', async () => {
    const response = await PATCH(request('me', { current_password: 'old', new_password: 'valid-password' }, 'PATCH'))
    expect(response.status).toBe(200)
    expect(fixture.password).toHaveBeenCalledWith('old', 'fixture-hash')
    expect(fixture.update).toHaveBeenCalledWith(1, { password: 'valid-password' })
    expect(fixture.session).toHaveBeenCalledWith(1, 'unknown', undefined, 2)
    expect(response.headers.get('set-cookie')).toContain('mc-session=fixture-session')
  })
})

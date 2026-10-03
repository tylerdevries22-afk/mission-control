import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ row: vi.fn(), prepare: vi.fn(), createUser: vi.fn(), security: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDatabase: () => ({ prepare: fixture.prepare }) }))
vi.mock('@/lib/auth-users', () => ({ createUser: fixture.createUser }))
vi.mock('@/lib/auth-context', () => ({
  getDefaultWorkspaceContext: () => ({ workspaceId: 2, tenantId: 20 }), resolveTenantForWorkspace: () => 20,
}))
vi.mock('@/lib/security-events', () => ({ logSecurityEvent: fixture.security }))

const secret = 'fixture-proxy-secret-with-at-least-32-characters'
const user = { id: 1, username: 'admin', display_name: 'Admin', role: 'admin',
  workspace_id: 2, tenant_id: 20, is_approved: 1, created_at: 1, updated_at: 1, last_login_at: null }

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.stubEnv('MC_PROXY_AUTH_HEADER', 'x-auth-user')
  vi.stubEnv('MC_PROXY_AUTH_TRUSTED_IPS', '10.0.0.2')
  vi.stubEnv('MC_PROXY_AUTH_SECRET', secret)
  vi.stubEnv('MISSION_CONTROL_TEST_MODE', '')
  vi.stubEnv('MC_E2E_TRUST_CLIENT_IP', '')
  fixture.prepare.mockReturnValue({ get: fixture.row })
  fixture.row.mockReturnValue(user)
})
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function authenticate(headers: Record<string, string> = {}) {
  const { resolveProxyUser } = await import('@/lib/auth-proxy')
  return resolveProxyUser(new Request('http://localhost', { headers: {
    'x-auth-user': 'admin', 'x-real-ip': '10.0.0.2', ...headers,
  } }), null)
}

describe('trusted proxy authentication', () => {
  it.each(['', 'too-short'])('fails closed when only spoofable IP headers are configured: %s', async value => {
    vi.stubEnv('MC_PROXY_AUTH_SECRET', value)
    expect(await authenticate({ 'x-mc-proxy-secret': secret })).toBeNull()
    expect(fixture.prepare).not.toHaveBeenCalled()
    expect(fixture.security).toHaveBeenCalledOnce()
  })

  it.each(['', 'wrong-secret'])('rejects a forged username/IP without the matching proxy secret: %s', async value => {
    expect(await authenticate({ 'x-mc-proxy-secret': value })).toBeNull()
    expect(fixture.prepare).not.toHaveBeenCalled()
  })

  it('requires the IP policy even with a valid secret', async () => {
    expect(await authenticate({ 'x-mc-proxy-secret': secret, 'x-real-ip': '198.51.100.9' })).toBeNull()
    expect(fixture.prepare).not.toHaveBeenCalled()
  })

  it('preserves approved proxy identity and workspace after both checks pass', async () => {
    expect(await authenticate({ 'x-mc-proxy-secret': secret })).toMatchObject({
      id: 1, role: 'admin', workspace_id: 2, tenant_id: 20,
    })
    expect(fixture.row).toHaveBeenCalledWith('admin')
  })

  it('rejects a disabled user after proxy verification', async () => {
    fixture.row.mockReturnValue({ ...user, is_approved: 0 })
    expect(await authenticate({ 'x-mc-proxy-secret': secret })).toBeNull()
  })

  it('keeps proxy authentication disabled when no username header is configured', async () => {
    vi.stubEnv('MC_PROXY_AUTH_HEADER', '')
    expect(await authenticate({ 'x-mc-proxy-secret': secret })).toBeNull()
    expect(fixture.prepare).not.toHaveBeenCalled()
  })
})

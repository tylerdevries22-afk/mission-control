// @vitest-environment node
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

interface Result { ok: boolean; status: number; data: Record<string, unknown>; setCookie?: string }
interface Request { method: string; route: string; body?: unknown; cookie?: string }
interface Context { baseUrl: string; timeoutMs: number; profile: { name: string } }
interface Dependencies {
  request: (input: Request) => Promise<Result>
  save: (...args: unknown[]) => void
  emit: (code: string) => void
  now: () => number
  sleep: (ms: number) => Promise<void>
}
const require = createRequire(import.meta.url)
const { desktopLogin } = require('../../../scripts/mc-cli-desktop-login.cjs') as {
  desktopLogin: (ctx: Context, flags: Record<string, string>, dependencies: Dependencies) => Promise<Result>
}
const ctx: Context = { baseUrl: 'http://127.0.0.1:4000', timeoutMs: 1000, profile: { name: 'default' } }
const flags = { 'expected-user': 'admin' }
const requestId = 'R'.repeat(43)
const token = 'a'.repeat(64)
const ok = (data: Record<string, unknown>, setCookie = '') => ({ ok: true, status: 200, data, setCookie })
function fixture() {
  const request = vi.fn().mockResolvedValueOnce(ok({ request_id: requestId, code: 'ABCD-2345', expires_at: 301 }))
    .mockResolvedValueOnce(ok({ status: 'pending' }))
    .mockResolvedValueOnce(ok({ status: 'approved' }, `mc-session=${token}; Path=/; HttpOnly`))
    .mockResolvedValueOnce(ok({ user: { username: 'admin', role: 'admin', workspace_id: 1, tenant_id: 1 } }))
  return { request, save: vi.fn(), emit: vi.fn(), now: () => 1000, sleep: vi.fn().mockResolvedValue(undefined) }
}

describe('desktop-approved CLI sign-in', () => {
  it('uses the existing one-time flow, verifies identity and stores only the approved session', async () => {
    const deps = fixture()
    const result = await desktopLogin(ctx, flags, deps)
    expect(deps.emit).toHaveBeenCalledWith('ABCD-2345')
    expect(deps.request.mock.calls[1][0]).toMatchObject({ route: '/api/auth/desktop-browser/poll', body: { request_id: requestId } })
    expect(deps.request.mock.calls[3][0]).toMatchObject({ method: 'GET', route: '/api/auth/me', cookie: `mc-session=${token}` })
    expect(deps.save).toHaveBeenCalledWith({ name: 'default', url: ctx.baseUrl, apiKey: '', cookie: `mc-session=${token}` }, undefined, true)
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain(token)
    expect(JSON.stringify(deps.emit.mock.calls)).not.toContain(requestId)
  })
  it('accepts the exact secure cookie name used by the backend', async () => {
    const deps = fixture()
    deps.request.mockReset().mockResolvedValueOnce(ok({ request_id: requestId, code: 'ABCD-2345', expires_at: 301 }))
      .mockResolvedValueOnce(ok({ status: 'approved' }, `__Host-mc-session=${token}; Path=/; Secure`))
      .mockResolvedValueOnce(ok({ user: { username: 'admin' } }))
    await desktopLogin(ctx, flags, deps)
    expect(deps.save.mock.calls[0][0]).toMatchObject({ cookie: `__Host-mc-session=${token}` })
    const names = readFileSync(new URL('../session-cookie.ts', import.meta.url), 'utf8')
    expect(names).toContain("'mc-session'")
    expect(names).toContain("'__Host-mc-session'")
  })
  it('requires an explicit account before issuing a code', async () => {
    const deps = fixture()
    await expect(desktopLogin(ctx, {}, deps)).rejects.toThrow('--expected-user')
    expect(deps.request).not.toHaveBeenCalled()
  })
  it.each(['http://remote.example', 'ftp://localhost', 'https://user:pass@control.example', 'http://localhost/path'])('rejects unsafe destination %s', async baseUrl => {
    const deps = fixture()
    await expect(desktopLogin({ ...ctx, baseUrl }, flags, deps)).rejects.toThrow('Desktop sign-in')
    expect(deps.request).not.toHaveBeenCalled()
  })
  it('rejects a mismatched identity and revokes only the newly issued session', async () => {
    const deps = fixture()
    await expect(desktopLogin(ctx, { 'expected-user': 'another-user' }, deps)).rejects.toThrow('account admin')
    expect(deps.save).not.toHaveBeenCalled()
    expect(deps.request.mock.calls.at(-1)?.[0]).toMatchObject({ route: '/api/auth/logout', cookie: `mc-session=${token}` })
  })
  it('never automatically replays an ambiguous consuming poll', async () => {
    const deps = fixture()
    deps.request.mockReset().mockResolvedValueOnce(ok({ request_id: requestId, code: 'ABCD-2345', expires_at: 301 }))
      .mockResolvedValueOnce({ ok: false, status: 0, data: {} })
    await expect(desktopLogin(ctx, flags, deps)).rejects.toThrow('fresh one-time code')
    expect(deps.request).toHaveBeenCalledTimes(2)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('rejects a malformed issuance without exposing its possession token', async () => {
    const deps = fixture()
    deps.request.mockReset().mockResolvedValueOnce(ok({ request_id: requestId, code: 'BAD', expires_at: 301 }))
    await expect(desktopLogin(ctx, flags, deps)).rejects.toThrow('Invalid sign-in response')
    expect(deps.emit).not.toHaveBeenCalled()
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('expires bounded pending polling without saving a profile', async () => {
    const deps = fixture()
    let time = 1000
    deps.now = () => time
    deps.sleep = vi.fn().mockImplementation(async () => { time = 302000 })
    await expect(desktopLogin(ctx, flags, deps)).rejects.toThrow('expired')
    expect(deps.request).toHaveBeenCalledTimes(2)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('does not accept the incorrect underscore cookie spelling', async () => {
    const deps = fixture()
    deps.request.mockReset().mockResolvedValueOnce(ok({ request_id: requestId, code: 'ABCD-2345', expires_at: 301 }))
      .mockResolvedValueOnce(ok({ status: 'approved' }, `mc_session=${token}; Path=/`))
    await expect(desktopLogin(ctx, flags, deps)).rejects.toThrow('no session')
    expect(deps.save).not.toHaveBeenCalled()
  })
})

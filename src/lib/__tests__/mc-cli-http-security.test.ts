// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface Result { ok: boolean; status: number; data: Record<string, unknown>; setCookie?: string; timeout?: boolean }
interface Input { baseUrl: string; method: string; route: string; timeoutMs?: number; cookie?: string }
const require = createRequire(import.meta.url)
const { httpRequest, publicResult } = require('../../../scripts/mc-cli-http.cjs') as {
  httpRequest: (input: Input) => Promise<Result>
  publicResult: (result: Result) => Record<string, unknown>
}
const input = { baseUrl: 'http://127.0.0.1:4000', method: 'GET', route: '/api/auth/me', timeoutMs: 20 }
afterEach(() => vi.unstubAllGlobals())

describe('CLI response and transport safety', () => {
  it('removes Set-Cookie from printable JSON', () => {
    const safe = publicResult({ ok: true, status: 200, data: { saved_cookie: true }, setCookie: 'mc-session=test-only' })
    expect(JSON.stringify(safe)).not.toContain('mc-session=test-only')
    expect(safe.saved_cookie_header).toBe('[redacted]')
  })
  it('preserves ordinary responses without inserting secret fields', () => {
    expect(publicResult({ ok: true, status: 200, data: {}, setCookie: '' })).toEqual({ ok: true, status: 200, data: {} })
  })
  it('does not follow redirects and sends an honest CLI user agent', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await httpRequest({ ...input, cookie: 'test-only' })
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: {
      Cookie: 'test-only', 'User-Agent': 'MissionControlCLI/2',
    } })
  })
  it.each(['GET', 'POST'])('bounds a stalled response body for %s', async method => {
    const fetch = vi.fn((_url: unknown, options: { signal: AbortSignal }) => Promise.resolve({
      ok: true, status: 200, headers: new Headers(),
      text: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })),
    }))
    vi.stubGlobal('fetch', fetch)
    const result = await httpRequest({ ...input, method })
    expect(result.timeout).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(method === 'GET' ? 2 : 1)
  })
  it('retries a failed read once but never an ambiguous mutation', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('synthetic network failure'))
    vi.stubGlobal('fetch', fetch)
    await httpRequest(input)
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockClear()
    await httpRequest({ ...input, method: 'POST' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('never retries an authorization denial', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"Unauthorized"}', { status: 401 }))
    vi.stubGlobal('fetch', fetch)
    expect((await httpRequest(input)).status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 3600001])('rejects invalid timeout %s', async timeoutMs => {
    await expect(httpRequest({ ...input, timeoutMs })).rejects.toThrow('Request timeout')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRequestOriginAllowed } from '@/lib/proxy-csrf'

afterEach(() => vi.unstubAllEnvs())

describe('browser request origin boundary', () => {
  const local = new URL('http://127.0.0.1:4000/api/agents')
  const headers = new Headers({ host: local.host })

  it('accepts same origin and credentialed API clients with no Origin', () => {
    expect(isRequestOriginAllowed(local.origin, local, headers)).toBe(true)
    expect(isRequestOriginAllowed(null, local, headers)).toBe(true)
  })

  it.each(['http://127.0.0.1:9999', 'https://127.0.0.1:4000', 'http://evil.example',
    'null', '', 'broken', 'file:///tmp/client.html', 'http://user@127.0.0.1:4000',
    'http://127.0.0.1:4000/untrusted', 'http://127.0.0.1:4000?query=1'])('rejects %s', origin => {
    expect(isRequestOriginAllowed(origin, local, headers)).toBe(false)
  })

  it('normalizes standard default ports and IPv6', () => {
    const request = new URL('https://example.com/api/agents')
    expect(isRequestOriginAllowed('https://example.com:443', request, new Headers())).toBe(true)
    const ipv6 = new URL('http://[::1]:4000/api/agents')
    expect(isRequestOriginAllowed(ipv6.origin, ipv6, new Headers())).toBe(true)
    expect(isRequestOriginAllowed('http://[::1]:9999', ipv6, new Headers())).toBe(false)
  })

  it('ignores spoofed proxy headers unless forwarding is explicitly trusted', () => {
    vi.stubEnv('MC_TRUST_FORWARDED_HOSTS', '0')
    const proxyHeaders = new Headers({ host: local.host, 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' })
    expect(isRequestOriginAllowed('https://evil.example', local, proxyHeaders)).toBe(false)
  })

  it('supports trusted reverse proxies with an exact external scheme and port', () => {
    vi.stubEnv('MC_TRUST_FORWARDED_HOSTS', '1')
    const proxyHeaders = new Headers({ host: local.host, 'x-forwarded-host': 'mc.example:8443', 'x-forwarded-proto': 'https' })
    expect(isRequestOriginAllowed('https://mc.example:8443', local, proxyHeaders)).toBe(true)
    expect(isRequestOriginAllowed('https://mc.example:9999', local, proxyHeaders)).toBe(false)
    expect(isRequestOriginAllowed('http://mc.example:8443', local, proxyHeaders)).toBe(false)
  })
})

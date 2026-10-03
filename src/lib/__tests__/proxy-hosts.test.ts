import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { envFlag, getImplicitAllowedHosts, getRequestHostCandidates, hostMatches } from '@/lib/proxy-hosts'

afterEach(() => vi.unstubAllEnvs())

describe('network host allowlist', () => {
  it('recognizes explicit environment flags', () => {
    vi.stubEnv('MC_TRUST_FORWARDED_HOSTS', 'yes')
    expect(envFlag('MC_TRUST_FORWARDED_HOSTS')).toBe(true)
    vi.stubEnv('MC_TRUST_FORWARDED_HOSTS', '0')
    expect(envFlag('MC_TRUST_FORWARDED_HOSTS')).toBe(false)
  })

  it('includes IPv4, IPv6 and hostname loopback defaults', () => {
    expect(getImplicitAllowedHosts()).toEqual(expect.arrayContaining(['localhost', '127.0.0.1', '::1']))
  })

  it('matches exact hosts and explicit subdomain/IP patterns', () => {
    expect(hostMatches('localhost', 'LOCALHOST:4000')).toBe(true)
    expect(hostMatches('*.example.com', 'a.example.com:443')).toBe(true)
    expect(hostMatches('*.example.com', 'example.com')).toBe(false)
    expect(hostMatches('*.example.com', 'badexample.com')).toBe(false)
    expect(hostMatches('100.*', '100.64.0.1')).toBe(true)
    expect(hostMatches('127.0.0.1', 'evil.example')).toBe(false)
    expect(hostMatches('::1', '[::1]:4000')).toBe(true)
    expect(hostMatches('', '')).toBe(false)
  })

  it('accepts forwarded host candidates only under explicit trust', () => {
    const request = new NextRequest('http://127.0.0.1:4000/api/agents', {
      headers: { host: '127.0.0.1:4000', 'x-forwarded-host': 'mc.example:8443' },
    })
    vi.stubEnv('MC_TRUST_FORWARDED_HOSTS', '0')
    expect(getRequestHostCandidates(request)).not.toContain('mc.example')
    vi.stubEnv('MC_TRUST_FORWARDED_HOSTS', '1')
    expect(getRequestHostCandidates(request)).toContain('mc.example')
  })
})

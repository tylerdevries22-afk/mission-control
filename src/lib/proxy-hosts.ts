import os from 'node:os'
import type { NextRequest } from 'next/server'

export function envFlag(name: string): boolean {
  const raw = process.env[name]
  if (raw === undefined) return false
  const v = String(raw).trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function normalizeHostname(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (value.startsWith('[')) return value.slice(1, value.indexOf(']'))
  if ((value.match(/:/g) || []).length > 1) return value
  return value.split(':')[0].replace(/\.$/, '')
}

function parseForwardedHost(forwarded: string | null): string[] {
  if (!forwarded) return []
  const hosts: string[] = []
  for (const part of forwarded.split(',')) {
    const match = /(?:^|;)\s*host="?([^";]+)"?/i.exec(part)
    if (match?.[1]) hosts.push(match[1])
  }
  return hosts
}

export function getRequestHostCandidates(request: NextRequest): string[] {
  const rawCandidates = [
    request.headers.get('host') || '',
    request.nextUrl.host || '',
    request.nextUrl.hostname || '',
  ]
  if (envFlag('MC_TRUST_FORWARDED_HOSTS')) {
    rawCandidates.push(
      ...(request.headers.get('x-forwarded-host') || '').split(','),
      ...(request.headers.get('x-original-host') || '').split(','),
      ...(request.headers.get('x-forwarded-server') || '').split(','),
      ...parseForwardedHost(request.headers.get('forwarded')),
    )
  }

  const candidates = rawCandidates
    .map(normalizeHostname)
    .filter(Boolean)

  return [...new Set(candidates)]
}

export function getImplicitAllowedHosts(): string[] {
  const candidates = [
    'localhost',
    '127.0.0.1',
    '::1',
    normalizeHostname(os.hostname()),
  ].filter(Boolean)

  return [...new Set(candidates)]
}

export function hostMatches(pattern: string, hostname: string): boolean {
  const p = normalizeHostname(pattern)
  const h = normalizeHostname(hostname)
  if (!p || !h) return false

  // "*.example.com" matches "a.example.com" (but not bare "example.com")
  if (p.startsWith('*.')) {
    const suffix = p.slice(2)
    return h.endsWith(`.${suffix}`)
  }

  // "100.*" matches "100.64.0.1"
  if (p.endsWith('.*')) {
    const prefix = p.slice(0, -1)
    return h.startsWith(prefix)
  }

  return h === p
}


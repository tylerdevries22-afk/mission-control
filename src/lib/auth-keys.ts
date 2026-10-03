import { createHash, timingSafeEqual } from 'node:crypto'
import { getDatabase } from './db'
import type { User } from './auth-types'

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Compare against dummy buffer to avoid timing leak on length mismatch
    const dummy = Buffer.alloc(bufA.length)
    timingSafeEqual(bufA, dummy)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}
/**
 * Check a presented key against the active global API key.
 *
 * DB settings override the env var (same precedence as before):
 * - 'security.api_key_hash' stores sha256(key) — compare hash-to-hash so the
 *   plaintext key is never at rest in SQLite (S1).
 * - Legacy 'security.api_key' (plaintext) is only honored when no hash row
 *   exists; migration 051 converts and deletes it, so this is dead post-migration.
 * - API_KEY env var is operator-controlled plaintext and compared directly.
 */
export function matchesGlobalApiKey(presentedKey: string): boolean {
  try {
    const db = getDatabase()
    const hashRow = db.prepare(
      "SELECT value FROM settings WHERE key = 'security.api_key_hash'"
    ).get() as { value: string } | undefined
    if (hashRow?.value) {
      return safeCompare(hashApiKey(presentedKey), hashRow.value)
    }
    // Legacy plaintext row (pre-migration databases only)
    const legacyRow = db.prepare(
      "SELECT value FROM settings WHERE key = 'security.api_key'"
    ).get() as { value: string } | undefined
    if (legacyRow?.value) {
      return safeCompare(presentedKey, legacyRow.value)
    }
  } catch {
    // DB not ready yet — fall back to env
  }
  const envKey = (process.env.API_KEY || '').trim()
  return envKey ? safeCompare(presentedKey, envKey) : false
}

export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const direct = (headers.get('x-api-key') || '').trim()
  if (direct) return direct

  const authorization = (headers.get('authorization') || '').trim()
  if (!authorization) return null

  const [scheme, ...rest] = authorization.split(/\s+/)
  if (!scheme || rest.length === 0) return null

  const normalized = scheme.toLowerCase()
  if (normalized === 'bearer' || normalized === 'apikey' || normalized === 'token') {
    return rest.join(' ').trim() || null
  }

  return null
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function parseAgentScopes(raw: string): Set<string> {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.map((scope) => String(scope)))
  } catch {
    // ignore parse errors
  }
  return new Set()
}

export function deriveRoleFromScopes(scopes: Set<string>): User['role'] {
  if (scopes.has('admin')) return 'admin'
  if (scopes.has('operator')) return 'operator'
  return 'viewer'
}

// Plugin hook: extensions can register a custom API key resolver without modifying this file.
type AuthResolverHook = (apiKey: string, agentName: string | null) => User | null
let _authResolverHook: AuthResolverHook | null = null
export function registerAuthResolver(hook: AuthResolverHook): void {
  _authResolverHook = hook
}

export function resolveAuthExtension(apiKey: string, agentName: string | null): User | null {
  return _authResolverHook?.(apiKey, agentName) ?? null
}

import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildMissionControlCsp, buildNonceRequestHeaders } from '@/lib/csp'
import { envFlag, getRequestHostCandidates, getImplicitAllowedHosts, hostMatches } from '@/lib/proxy-hosts'
import { isRequestOriginAllowed } from '@/lib/proxy-csrf'
import { MC_SESSION_COOKIE_NAME, LEGACY_MC_SESSION_COOKIE_NAME } from '@/lib/session-cookie'

/** Constant-time string comparison using Node.js crypto. */
function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function nextResponseWithNonce(request: NextRequest): { response: NextResponse; nonce: string } {
  const nonce = crypto.randomBytes(16).toString('base64')
  const googleEnabled = !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)
  const requestHeaders = buildNonceRequestHeaders({
    headers: request.headers,
    nonce,
    googleEnabled,
    allowUnsafeEval: process.env.NODE_ENV !== 'production',
  })
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  // Debug log retained (commented) for future CSP/nonce flow troubleshooting.
  // console.log(`[DEBUG csp] proxy generated nonce for ${request.nextUrl.pathname}: ${nonce.slice(0, 8)}...`)
  return { response, nonce }
}

function addSecurityHeaders(response: NextResponse, request: NextRequest, nonce?: string): NextResponse {
  const requestId = crypto.randomUUID()
  response.headers.set('X-Request-Id', requestId)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none')
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (forwardedProtocol === 'https' || request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  const googleEnabled = !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)
  const effectiveNonce = nonce || crypto.randomBytes(16).toString('base64')
  response.headers.set('Content-Security-Policy', buildMissionControlCsp({
    nonce: effectiveNonce,
    googleEnabled,
    allowUnsafeEval: process.env.NODE_ENV !== 'production',
  }))

  return response
}

function extractApiKeyFromRequest(request: NextRequest): string {
  const direct = (request.headers.get('x-api-key') || '').trim()
  if (direct) return direct

  const authorization = (request.headers.get('authorization') || '').trim()
  if (!authorization) return ''

  const [scheme, ...rest] = authorization.split(/\s+/)
  if (!scheme || rest.length === 0) return ''
  const normalized = scheme.toLowerCase()
  if (normalized === 'bearer' || normalized === 'apikey' || normalized === 'token') {
    return rest.join(' ').trim()
  }
  return ''
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicHealthProbe = pathname === '/api/status' && request.nextUrl.searchParams.get('action') === 'health'
  const isPublicHealthRoute = pathname === '/api/health' || pathname === '/health'

  // Network access control.
  // In production: default-deny unless explicitly allowed.
  // In dev/test: allow all hosts unless overridden.
  const requestHosts = getRequestHostCandidates(request)
  const allowAnyHost = envFlag('MC_ALLOW_ANY_HOST')
  const allowedPatterns = String(process.env.MC_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const implicitAllowedHosts = getImplicitAllowedHosts()

  // Production must fail closed: when MC_ALLOW_ANY_HOST is not set,
  // only implicit local hosts plus any explicit MC_ALLOWED_HOSTS patterns are allowed.
  // Non-production keeps current looser behavior (allow all unless MC_ALLOWED_HOSTS is set).
  const isProduction = process.env.NODE_ENV === 'production'
  const enforceAllowlist = isProduction ? !allowAnyHost : allowedPatterns.length > 0
  const isAllowedHost = !enforceAllowlist
    || requestHosts.some((hostName) =>
      implicitAllowedHosts.some((candidate) => hostMatches(candidate, hostName))
      || allowedPatterns.some((pattern) => hostMatches(pattern, hostName))
    )

  if (!isAllowedHost) {
    return addSecurityHeaders(new NextResponse('Forbidden', { status: 403 }), request)
  }

  // CSRF Origin validation for mutating requests
  const method = request.method.toUpperCase()
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    if (!isRequestOriginAllowed(request.headers.get('origin'), request.nextUrl, request.headers)) {
      return addSecurityHeaders(NextResponse.json({ error: 'CSRF origin mismatch' }, { status: 403 }), request)
    }
  }

  // Allow login, setup, auth API, docs, and container health probes without session
  // Exact-match only (no prefix/wildcard) so this exempts just the two health routes.
  if (pathname === '/login' || pathname === '/setup' || pathname.startsWith('/api/auth/') || pathname === '/api/setup' || pathname === '/api/docs' || pathname === '/docs' || isPublicHealthProbe || isPublicHealthRoute) {
    const { response, nonce } = nextResponseWithNonce(request)
    return addSecurityHeaders(response, request, nonce)
  }

  // Check for session cookie
  const sessionToken = request.cookies.get(MC_SESSION_COOKIE_NAME)?.value || request.cookies.get(LEGACY_MC_SESSION_COOKIE_NAME)?.value

  // API routes: accept session cookie OR API key
  if (pathname.startsWith('/api/')) {
    const configuredApiKey = (process.env.API_KEY || '').trim()
    const apiKey = extractApiKeyFromRequest(request)
    const hasValidApiKey = Boolean(configuredApiKey && apiKey && safeCompare(apiKey, configuredApiKey))

    // DB-backed keys (dashboard-rotated `mc_` global keys and `mca_` agent
    // keys) are validated in route auth — the edge runtime cannot query
    // SQLite, so the proxy only shape-checks them and lets route auth decide.
    // Both formats are exactly 48 hex chars after the prefix.
    const looksLikeDbBackedApiKey = /^mca?_[a-f0-9]{48}$/i.test(apiKey)

    if (sessionToken || hasValidApiKey || looksLikeDbBackedApiKey) {
      const { response, nonce } = nextResponseWithNonce(request)
      return addSecurityHeaders(response, request, nonce)
    }

    return addSecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request)
  }

  // Page routes: redirect to login if no session
  if (sessionToken) {
    const { response, nonce } = nextResponseWithNonce(request)
    return addSecurityHeaders(response, request, nonce)
  }

  // Redirect to login
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  return addSecurityHeaders(NextResponse.redirect(loginUrl), request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)']
}

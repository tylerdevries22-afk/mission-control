import { envFlag } from './proxy-hosts'

/** Validate browser origins including scheme and port; absent Origin permits API clients. */
export function isRequestOriginAllowed(origin: string | null, requestUrl: Pick<URL, 'host' | 'protocol'>, headers: Headers): boolean {
  if (origin === null) return true
  let source: URL
  try { source = new URL(origin) } catch { return false }
  if (!['http:', 'https:'].includes(source.protocol)
    || source.username || source.password || source.pathname !== '/' || source.search || source.hash) return false

  const trustedForwarding = envFlag('MC_TRUST_FORWARDED_HOSTS')
  const forwardedProtocol = trustedForwarding
    ? headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    : undefined
  const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
    ? `${forwardedProtocol}:` : requestUrl.protocol
  const hosts = [headers.get('host') || requestUrl.host, requestUrl.host]
  if (trustedForwarding) {
    hosts.push(...(headers.get('x-forwarded-host') || '').split(','))
    const forwarded = headers.get('forwarded') || ''
    for (const part of forwarded.split(',')) {
      const match = /(?:^|;)\s*host="?([^";]+)"?/i.exec(part)
      if (match?.[1]) hosts.push(match[1])
    }
  }
  return hosts.some(host => {
    try { return new URL(`${protocol}//${host.trim()}`).origin === source.origin } catch { return false }
  })
}

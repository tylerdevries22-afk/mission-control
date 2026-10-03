/** Return a local destination only after checking the browser's URL interpretation. */
export function safeLoginDestination(candidate: unknown, origin: string): string {
  if (typeof candidate !== 'string' || candidate.length > 4096 || !candidate.startsWith('/') ||
      candidate.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(candidate)) return '/'
  try {
    const base = new URL(origin)
    if (!['http:', 'https:'].includes(base.protocol)) return '/'
    const destination = new URL(candidate, base)
    if (destination.origin !== base.origin) return '/'
    return destination.pathname + destination.search + destination.hash
  } catch {
    return '/'
  }
}

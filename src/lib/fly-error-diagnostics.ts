export type FlyFailureKind = 'configuration' | 'http' | 'timeout' | 'transport' | 'body_read' | 'invalid_response' | 'unknown'
export type FlyErrorDiagnostic = Readonly<{
  error: 'FlyMachinesError' | 'unknown'
  failureKind: FlyFailureKind
  httpStatus?: number
  retryAfterMs?: number
}>
function failureKind(value: unknown): FlyFailureKind {
  switch (value) {
    case 'configuration': case 'http': case 'timeout': case 'transport': case 'body_read': case 'invalid_response': return value
    default: return 'unknown'
  }
}
function own(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}
/** Raw messages, bodies, URLs and causes never become controller diagnostics. */
export function safeFlyErrorDiagnostic(error: unknown): FlyErrorDiagnostic {
  const unknown: FlyErrorDiagnostic = { error: 'unknown', failureKind: 'unknown' }
  try {
    if (!error || typeof error !== 'object' || own(error, 'diagnosticFamily') !== 'fly_machines') return unknown
    const kind = own(error, 'diagnosticKind')
    const status = own(error, 'status')
    const retry = own(error, 'retryAfterMs')
    return {
      error: 'FlyMachinesError',
      failureKind: failureKind(kind),
      ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}),
      ...(typeof retry === 'number' && Number.isFinite(retry) && retry >= 0 && retry <= 10_000 ? { retryAfterMs: retry } : {}),
    }
  } catch {
    return unknown
  }
}

/**
 * Lightweight structured logger for client-side ('use client') components.
 *
 * Mirrors pino's API surface (info/warn/error/debug) so call sites are
 * consistent with the server-side logger in src/lib/logger.ts.
 * In production builds, debug and info messages are suppressed.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const minLevel: number =
  process.env.NODE_ENV === 'production' ? LOG_LEVELS.warn : LOG_LEVELS.debug

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= minLevel
}

function safeLogValue(value: unknown): string {
  // Serialize structured context too: custom objects must not bypass line boundaries.
  let formatted: string
  if (typeof value === 'string') formatted = value
  else {
    try {
      const context = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
      formatted = JSON.stringify(context, (key, item: unknown) =>
        /^(password|passphrase|secret|token|access_token|refresh_token|id_token|api[_-]?key|authorization)$/i.test(key)
          ? '[redacted]' : item) ?? String(value)
    } catch {
      formatted = '[unserializable context]'
    }
  }
  return formatted.replace(/\n|\r/g, ' ')
}

function formatArgs(
  level: LogLevel,
  module: string,
  msgOrObj: unknown,
  ...rest: unknown[]
): string[] {
  const prefix = `[${level.toUpperCase()}] ${module.replace(/\n|\r/g, ' ')}:`
  return [prefix, safeLogValue(msgOrObj), ...rest.map(safeLogValue)]
}

export interface ClientLogger {
  debug(msg: string, ...args: unknown[]): void
  debug(obj: Record<string, unknown> | Error, msg?: string): void
  info(msg: string, ...args: unknown[]): void
  info(obj: Record<string, unknown> | Error, msg?: string): void
  warn(msg: string, ...args: unknown[]): void
  warn(obj: Record<string, unknown> | Error, msg?: string): void
  error(msg: string, ...args: unknown[]): void
  error(obj: Record<string, unknown> | Error, msg?: string): void
}

export function createClientLogger(module: string): ClientLogger {
  // The sink also removes record separators if the upstream formatter ever changes.
  return {
    debug(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('debug')) return
      console.debug(formatArgs('debug', module, msgOrObj, ...rest).join(' ').replace(/\n|\r/g, ''))
    },
    info(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('info')) return
      console.info(formatArgs('info', module, msgOrObj, ...rest).join(' ').replace(/\n|\r/g, ''))
    },
    warn(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('warn')) return
      console.warn(formatArgs('warn', module, msgOrObj, ...rest).join(' ').replace(/\n|\r/g, ''))
    },
    error(msgOrObj: unknown, ...rest: unknown[]) {
      if (!shouldLog('error')) return
      console.error(formatArgs('error', module, msgOrObj, ...rest).join(' ').replace(/\n|\r/g, ''))
    },
  }
}

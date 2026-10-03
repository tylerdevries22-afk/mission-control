import type { JsonValue } from '@/store'

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

export function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function jsonValue(value: unknown, depth = 0): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (depth >= 20) return undefined
  if (Array.isArray(value)) return value.map(item => jsonValue(item, depth + 1) ?? null)
  const object = record(value)
  if (!object) return undefined
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, jsonValue(item, depth + 1)]))
}

export function jsonRecord(value: unknown): Record<string, JsonValue | undefined> {
  const object = record(value)
  return object ? Object.fromEntries(Object.entries(object).map(([key, item]) => [key, jsonValue(item)])) : {}
}

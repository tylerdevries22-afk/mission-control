'use client'

import { useTranslations } from 'next-intl'

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function parseCount(raw?: string): number | null {
  if (!raw) return null
  const match = raw.trim().toLowerCase().match(/^([\d.]+)\s*([kmb])?/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const factor = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : match[2] === 'b' ? 1_000_000_000 : 1
  return amount * factor
}

export function parseContextPercent(tokens?: string | null): number | null {
  if (!tokens) return null
  const labeled = tokens.match(/\((\d+(?:\.\d+)?)%\)/)
  if (labeled) return clamp(Number(labeled[1]))
  const [usedRaw, capRaw] = tokens.split('/')
  const used = parseCount(usedRaw)
  const cap = parseCount(capRaw)
  if (used == null || !cap) return null
  return clamp(Math.round((used / cap) * 100))
}

export function ContextWindowBar({
  percent,
  tokens,
  duration,
  compact = false,
}: {
  percent?: number | null
  tokens?: string
  duration?: string
  compact?: boolean
}) {
  const t = useTranslations('chatDesktop')
  const value = percent ?? parseContextPercent(tokens)
  if (value == null && !tokens && !duration) return null
  const hot = (value ?? 0) >= 85
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--chat-muted)]">
      {value != null && (
        <div
          className={`${compact ? 'h-0.5 w-8' : 'h-1 w-16'} overflow-hidden rounded-full bg-white/10`}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(value)}
          aria-label={t('contextWindow', { percent: Math.round(value) })}
        >
          <div
            className={`h-full rounded-full ${hot ? 'bg-[var(--chat-accent)]' : 'bg-white/70'}`}
            style={{ width: `${value}%` }}
          />
        </div>
      )}
      {tokens ? <span className="truncate">{compact ? tokens : t('tokensUsed', { tokens })}</span> : null}
      {duration ? <span className="shrink-0">{compact ? duration : t('timeSpent', { time: duration })}</span> : null}
    </div>
  )
}

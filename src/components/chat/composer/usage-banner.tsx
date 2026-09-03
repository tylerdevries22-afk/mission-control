'use client'

import { useTranslations } from 'next-intl'

export function UsageBanner({
  usedPercent,
  resetsAt,
}: {
  usedPercent: number | null
  resetsAt: string | null
}) {
  const t = useTranslations('chatDesktop')
  if (usedPercent == null) return null
  const clamped = Math.min(100, Math.max(0, usedPercent))
  return (
    <div className="mb-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elevated)] px-3 py-2">
      <div className="flex items-center justify-between text-[12px] text-[var(--chat-muted)]">
        <span>{t('usageLimit', { percent: Math.round(clamped) })}</span>
        {resetsAt ? <span>{t('usageResets', { date: resetsAt })}</span> : null}
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-[var(--chat-text)]" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

'use client'

import { ContextWindowBar } from './context-window-bar'

export function SessionStatusBar({
  tokens,
  duration,
  percent,
  status,
}: {
  tokens?: string
  duration?: string
  percent?: number | null
  status?: string
}) {
  if (percent == null && !duration && !tokens && !status) return null
  return (
    <div className="flex items-center gap-3 px-6 pb-2 text-[12px] text-[var(--chat-muted)]">
      <ContextWindowBar percent={percent} tokens={tokens} duration={duration} />
      {status ? <span className="shrink-0">{status}</span> : null}
    </div>
  )
}

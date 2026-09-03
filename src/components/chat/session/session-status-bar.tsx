'use client'

import { IconSparkle } from '../desktop/chat-icons'

export function SessionStatusBar({
  age,
  tokens,
  status,
}: {
  age?: string
  tokens?: string
  status?: string
}) {
  const parts = [age, tokens, status].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <div className="flex items-center gap-2 px-6 pb-2 text-[12px] text-[var(--chat-muted)]">
      <IconSparkle className="h-3.5 w-3.5" />
      <span>{parts.join(' · ')}</span>
    </div>
  )
}

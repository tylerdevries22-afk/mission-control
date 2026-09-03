'use client'

import { IconFolder } from '../desktop/chat-icons'

export function SessionHeader({
  title,
  project,
}: {
  title: string
  project?: string
  kind?: string
}) {
  return (
    <header className="flex items-center gap-2 border-b border-[var(--chat-border)] px-6 py-2 text-[13px] text-[var(--chat-text)]">
      <IconFolder className="h-3.5 w-3.5 text-[var(--chat-muted)]" />
      <h1 className="min-w-0 flex-1 truncate font-medium">{title}</h1>
      {project ? (
        <span className="inline-flex h-6 max-w-[180px] shrink-0 items-center truncate rounded-full border border-[var(--chat-border)] bg-[var(--chat-elevated)] px-2 text-[12px] text-[var(--chat-muted)]">
          {project}
        </span>
      ) : null}
    </header>
  )
}

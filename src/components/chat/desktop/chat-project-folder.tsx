'use client'

import { useTranslations } from 'next-intl'
import { EngineLogoSet } from '@/components/brand/engine-logo'
import type { SidebarRow } from '@/lib/group-sessions'
import { ChatSessionRow, type GitLensSessionRow } from './chat-session-row'
import { IconChevron, IconGrip, IconPin } from './chat-icons'
import type { FolderDragProps } from './use-folder-dnd'

const ROW =
  'group flex h-8 w-full items-center rounded-lg px-2 text-[13px] text-[var(--chat-muted)] motion-safe:duration-200 motion-safe:transition-[transform,opacity] hover:bg-white/5 hover:text-[var(--chat-text)]'

export function ChatProjectFolder({
  row,
  selected,
  showPr,
  sessions,
  activeSessionId,
  pinned,
  dragging,
  now,
  onSelect,
  onNewInGroup,
  onTogglePin,
  onSelectSession,
  folderProps,
}: {
  row: SidebarRow
  selected: boolean
  showPr: boolean
  sessions: GitLensSessionRow[]
  activeSessionId: string | null
  pinned: boolean
  dragging: boolean
  now?: number
  onSelect: (row: SidebarRow) => void
  onNewInGroup: (row: SidebarRow) => void
  onTogglePin: (slug: string) => void
  onSelectSession: (id: string) => void
  folderProps: FolderDragProps
}) {
  const t = useTranslations('chatDesktop')
  const slug = row.key.slice(row.key.indexOf(':') + 1)
  const children = selected ? sessions : []
  return (
    <div
      {...folderProps}
      className={dragging ? 'opacity-40' : 'opacity-100'}
      aria-grabbed={dragging}
    >
      <div className={`${ROW} ${selected ? 'border border-[var(--chat-border)] bg-transparent text-[var(--chat-text)]' : 'border border-transparent'}`}>
        <span className="mr-1 cursor-grab text-[var(--chat-muted)] opacity-50" aria-hidden>
          <IconGrip />
        </span>
        <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left" onClick={() => onSelect(row)}>
          {row.label}
          {row.sessionCount > 0 ? <span className="ml-1 text-[11px] opacity-60">{row.sessionCount}</span> : null}
          {showPr && row.hasPr ? <span className="ml-1 text-[10px] text-[var(--chat-accent)]">PR</span> : null}
        </button>
        <button
          type="button"
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[var(--chat-muted)] hover:text-[var(--chat-text)]"
          onClick={() => onTogglePin(slug)}
          aria-label={pinned ? `Unpin ${row.label}` : `Pin ${row.label}`}
          aria-pressed={pinned}
        >
          <IconPin filled={pinned} />
        </button>
        <button
          type="button"
          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-[var(--chat-muted)] hover:text-[var(--chat-text)]"
          onClick={() => onNewInGroup(row)}
          aria-label={t('newInProject', { project: row.label })}
        >
          +
        </button>
        <EngineLogoSet kinds={sessions.map((session) => session.kind)} size={14} />
        <IconChevron className={`ml-1 opacity-50 ${selected ? 'rotate-90' : ''}`} />
      </div>
      {children.map((session) => (
        <ChatSessionRow
          key={session.id}
          session={session}
          selected={session.id === activeSessionId}
          onSelect={onSelectSession}
          now={now}
        />
      ))}
    </div>
  )
}

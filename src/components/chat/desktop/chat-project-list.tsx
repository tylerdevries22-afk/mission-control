'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ChatFilterState } from '@/lib/group-sessions'
import type { SidebarRow } from '@/lib/group-sessions'
import { ChatFilterPopover } from './chat-filter-popover'
import { IconChevron, IconSearch, IconSliders } from './chat-icons'

const ROW =
  'group flex h-8 w-full items-center rounded-lg px-2 text-[13px] text-[var(--chat-muted)] hover:bg-white/5 hover:text-[var(--chat-text)]'

export function ChatProjectList({
  pinned,
  rest,
  selectedKey,
  filters,
  onFiltersChange,
  onSelect,
  onNewInGroup,
  onSearch,
}: {
  pinned: SidebarRow[]
  rest: SidebarRow[]
  selectedKey: string | null
  filters: ChatFilterState
  onFiltersChange: (next: ChatFilterState) => void
  onSelect: (row: SidebarRow) => void
  onNewInGroup: (row: SidebarRow) => void
  onSearch: (value: string) => void
}) {
  const t = useTranslations('chatDesktop')
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pt-3">
      <div className="flex items-center gap-1 px-1">
        <span className="flex-1 text-[13px] text-[var(--chat-muted)]">{t('projects')}</span>
        <button type="button" className="rounded p-1 text-[var(--chat-muted)] hover:bg-white/5" onClick={() => onNewInGroup(rest[0] || pinned[0])} aria-label={t('navNew')} disabled={!rest.length && !pinned.length}>
          <span className="text-sm leading-none">+</span>
        </button>
        <button type="button" className="rounded p-1 text-[var(--chat-muted)] hover:bg-white/5" onClick={() => setSearchOpen((open) => !open)} aria-label={t('searchProjects')}>
          <IconSearch />
        </button>
        <div className="relative">
          <button
            type="button"
            className="rounded p-1 text-[var(--chat-muted)] hover:bg-white/5"
            onClick={() => setFilterOpen((open) => !open)}
            aria-label={t('filterProjects')}
            aria-expanded={filterOpen}
          >
            <IconSliders />
          </button>
          {filterOpen && (
            <ChatFilterPopover
              value={filters}
              onChange={onFiltersChange}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>
      </div>
      {searchOpen && (
        <input
          value={filters.search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t('searchProjects')}
          className="mt-2 h-8 rounded-md border border-[var(--chat-border)] bg-black/30 px-2 text-[13px] text-[var(--chat-text)] placeholder:text-[var(--chat-muted)]"
        />
      )}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {pinned.length > 0 && (
          <Section label={t('pinned')} rows={pinned} selectedKey={selectedKey} showPr={filters.showPrStatus} onSelect={onSelect} onNewInGroup={onNewInGroup} />
        )}
        <Section rows={rest} selectedKey={selectedKey} showPr={filters.showPrStatus} onSelect={onSelect} onNewInGroup={onNewInGroup} />
      </div>
    </div>
  )
}

function Section({
  label,
  rows,
  selectedKey,
  showPr,
  onSelect,
  onNewInGroup,
}: {
  label?: string
  rows: SidebarRow[]
  selectedKey: string | null
  showPr: boolean
  onSelect: (row: SidebarRow) => void
  onNewInGroup: (row: SidebarRow) => void
}) {
  const t = useTranslations('chatDesktop')
  return (
    <div className="mb-2">
      {label && (
        <button type="button" className="flex h-7 w-full items-center gap-1 px-2 text-[13px] text-[var(--chat-muted)]">
          {label}
          <IconChevron className="h-3 w-3 rotate-90" />
        </button>
      )}
      {rows.map((row) => {
        const selected = row.key === selectedKey
        return (
          <div
            key={row.key}
            className={`${ROW} ${selected ? 'border border-[var(--chat-border)] bg-transparent text-[var(--chat-text)]' : 'border border-transparent'}`}
          >
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(row)}>
              {row.label}
              {showPr && row.hasPr ? <span className="ml-1 text-[10px] text-[var(--chat-accent)]">PR</span> : null}
            </button>
            <button
              type="button"
              className="hidden h-5 w-5 items-center justify-center rounded text-[var(--chat-muted)] group-hover:flex hover:text-[var(--chat-text)]"
              onClick={() => onNewInGroup(row)}
              aria-label={t('newInProject', { project: row.label })}
            >
              +
            </button>
            <IconChevron className="ml-1 opacity-50" />
          </div>
        )
      })}
    </div>
  )
}

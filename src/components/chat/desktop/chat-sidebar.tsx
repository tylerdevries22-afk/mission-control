'use client'

import type { ChatFilterState, SidebarRow } from '@/lib/group-sessions'
import { ChatNav } from './chat-nav'
import { ChatProjectList } from './chat-project-list'
import { ChatUserFooter } from './chat-user-footer'

export function ChatSidebar({
  pinned,
  rest,
  selectedKey,
  filters,
  onFiltersChange,
  onSelect,
  onNew,
  onNewInGroup,
  onSearch,
}: {
  pinned: SidebarRow[]
  rest: SidebarRow[]
  selectedKey: string | null
  filters: ChatFilterState
  onFiltersChange: (next: ChatFilterState) => void
  onSelect: (row: SidebarRow) => void
  onNew: () => void
  onNewInGroup: (row: SidebarRow) => void
  onSearch: (value: string) => void
}) {
  return (
    <aside className="hidden h-full w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--chat-border)] bg-[var(--chat-sidebar)] md:flex">
      <ChatNav onNew={onNew} />
      <ChatProjectList
        pinned={pinned}
        rest={rest}
        selectedKey={selectedKey}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onSelect={onSelect}
        onNewInGroup={onNewInGroup}
        onSearch={onSearch}
      />
      <ChatUserFooter />
    </aside>
  )
}

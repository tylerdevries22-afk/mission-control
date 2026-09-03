'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMissionControl } from '@/store'
import { apiFetch } from '@/lib/api-client'
import { workingDirLeaf } from '@/lib/chat-display'
import { buildSidebarRows, type ChatSessionItem, type SidebarRow } from '@/lib/group-sessions'
import type { ChatPullRequest } from '@/lib/github-pulls'
import { extractPlanMarkdown } from '@/lib/session-plan'
import { useChatConversations } from '../use-chat-conversations'
import { useChatDesktopPrefs } from '../use-chat-desktop-prefs'
import { useDesktopSend } from '../use-desktop-send'
import { useSessionTranscript } from '../use-session-transcript'
import { ChatComposer } from '../composer/chat-composer'
import { ChatWelcome } from '../home/chat-welcome'
import { SessionPlanPanel } from '../session/session-plan-panel'
import { SessionPrChip } from '../session/session-pr-chip'
import { SessionStatusBar } from '../session/session-status-bar'
import { SessionThread } from '../session/session-thread'
import { ChatMobileBar } from './chat-mobile-bar'
import { ChatShell } from './chat-shell'
import { ChatSidebar } from './chat-sidebar'
import type { HomeSessionRow } from '../home/chat-home-list'

export function ChatDesktopWorkspace() {
  const { currentUser, projects, setActiveConversation, activeConversation, conversations } = useMissionControl()
  const { agents } = useChatConversations()
  const prefs = useChatDesktopPrefs(currentUser?.id)
  const selected = conversations.find((conv) => conv.id === activeConversation)
  const transcript = useSessionTranscript(selected?.session)
  const sender = useDesktopSend(transcript.refresh)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(true)
  const [pulls, setPulls] = useState<ChatPullRequest[]>([])
  const [prHidden, setPrHidden] = useState(false)

  useEffect(() => {
    apiFetch<{ pullRequests?: ChatPullRequest[] }>('/api/github?action=pulls')
      .then((data) => setPulls(Array.isArray(data.pullRequests) ? data.pullRequests : []))
      .catch(() => setPulls([]))
  }, [])

  const items: ChatSessionItem[] = useMemo(() => conversations.filter((conv) => conv.source === 'session').map((conv) => {
    const leaf = workingDirLeaf(conv.session?.workingDir)
    return {
      id: conv.id,
      name: conv.name || conv.id,
      active: !!conv.session?.active,
      updatedAt: conv.updatedAt,
      workingDir: conv.session?.workingDir || null,
      agent: conv.session?.agent || '',
      environment: conv.session?.sessionKind === 'gateway' ? 'gateway' : 'local',
      project: leaf,
      projectSlug: leaf.toLowerCase(),
      hasPr: pulls.some((pr) => pr.repo.toLowerCase().includes(leaf.toLowerCase())),
    }
  }), [conversations, pulls])

  const rows = useMemo(
    () => buildSidebarRows(items, projects.map((p) => ({ name: p.name, slug: p.slug })), prefs.filters, prefs.pins),
    [items, projects, prefs.filters, prefs.pins],
  )

  const homeSessions: HomeSessionRow[] = items.slice(0, 8).map((item) => ({
    id: item.id,
    title: item.name,
    subtitle: [item.agent, item.project].filter(Boolean).join(' · '),
    repo: item.project,
    updatedAt: item.updatedAt,
    active: item.active,
    hasPr: item.hasPr,
  }))

  const onNew = () => setActiveConversation(null)
  const onSelectRow = (row: SidebarRow) => {
    setSelectedKey(row.key)
    const match = items.find((item) => item.projectSlug === row.key.slice(row.key.indexOf(':') + 1))
    if (match) setActiveConversation(null)
  }
  const onSend = (text: string) => {
    if (selected?.session) {
      void sender.sendSession(text, selected.session)
      return
    }
    if (activeConversation && !activeConversation.startsWith('session:')) {
      void sender.sendAgent(text, activeConversation)
      return
    }
    const agent = agents[0]
    if (!agent) return
    const id = `agent_${agent.name}`
    setActiveConversation(id)
    void sender.sendAgent(text, id)
  }

  const plan = extractPlanMarkdown(transcript.messages)
  const leaf = workingDirLeaf(selected?.session?.workingDir)
  const pr = pulls.find((item) => leaf && item.repo.toLowerCase().includes(leaf.toLowerCase()))

  return (
    <ChatShell
      sidebar={(
        <ChatSidebar
          pinned={rows.pinned}
          rest={rows.rest}
          selectedKey={selectedKey}
          filters={prefs.filters}
          onFiltersChange={prefs.setFilters}
          onSelect={onSelectRow}
          onNew={onNew}
          onNewInGroup={onSelectRow}
          onSearch={(search) => prefs.setFilters({ ...prefs.filters, search })}
        />
      )}
      main={(
        <>
          <ChatMobileBar onNew={onNew} />
          {selected?.session ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {transcript.loading && <p className="px-8 pt-6 text-[13px] text-[var(--chat-muted)]">Loading…</p>}
                {transcript.error && <p className="px-8 pt-6 text-[13px] text-red-400">{transcript.error}</p>}
                <SessionThread messages={transcript.messages} />
              </div>
              <SessionStatusBar age={selected.session.age} tokens={selected.session.tokens} status={selected.session.active ? 'Active' : 'Idle'} />
              <div className="px-6">
                {!prHidden && pr && (
                  <SessionPrChip number={pr.number} repo={pr.repo} href={pr.htmlUrl} additions={pr.additions} deletions={pr.deletions} onDismiss={() => setPrHidden(true)} />
                )}
              </div>
            </div>
          ) : (
            <ChatWelcome
              displayName={currentUser?.display_name || currentUser?.username || ''}
              sessions={homeSessions}
              pullRequests={pulls}
              onSelectSession={setActiveConversation}
            />
          )}
          <ChatComposer
            placeholder={selected?.session ? 'Type / for commands' : 'Ask Mission Control'}
            disabled={sender.busy}
            isSending={sender.busy}
            environment={selected?.session?.sessionKind === 'gateway' ? 'Gateway' : 'Local'}
            project={leaf}
            folder={leaf}
            modelAlias={prefs.modelAlias}
            onModelAlias={prefs.setModelAlias}
            fastMode={prefs.fastMode}
            onFastMode={prefs.setFastMode}
            usedPercent={null}
            resetsAt={null}
            onBypass={() => undefined}
            onSend={onSend}
          />
        </>
      )}
      plan={selected?.session && planOpen && plan ? (
        <SessionPlanPanel title={selected.name || 'Plan'} markdown={plan} onClose={() => setPlanOpen(false)} />
      ) : undefined}
    />
  )
}

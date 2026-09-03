'use client'

import { isTreeKind } from '@/lib/chat-session-identity'
import { contextPercent, formatDuration, formatTokenLabel, parseSessionTokens, sessionDurationMs } from '@/lib/chat-session-metrics'
import type { ChatPullRequest } from '@/lib/github-pulls'
import type { Conversation } from '@/store'
import { HandoffBanner, transcriptExcerpt } from './handoff-banner'
import { SessionHeader } from './session-header'
import { SessionPrChip } from './session-pr-chip'
import { SessionStatusBar } from './session-status-bar'
import { SessionThread } from './session-thread'
import type { SessionTranscriptMessage } from '../session-message'

export function ChatSessionPane({
  conversation,
  project,
  messages,
  loading,
  error,
  pr,
  prHidden,
  onDismissPr,
  onHandoff,
}: {
  conversation: Conversation
  project: string
  messages: SessionTranscriptMessage[]
  loading: boolean
  error: string | null
  pr?: ChatPullRequest
  prHidden: boolean
  onDismissPr: () => void
  onHandoff: (nextId: string | null, kind?: string) => void
}) {
  const session = conversation.session
  if (!session) return null
  const parsed = parseSessionTokens(session.tokens)
  const percent = contextPercent(session.tokens, session.model)
  const duration = formatDuration(sessionDurationMs(session.startTime, session.lastActivity))
  const title = conversation.name || session.displayName || session.sessionId
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SessionHeader title={title} project={project} kind={session.sessionKind} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && messages.length === 0 && <p className="px-8 pt-6 text-[13px] text-[var(--chat-muted)]">Loading…</p>}
        {error && <p className="px-8 pt-6 text-[13px] text-red-400">{error}</p>}
        <SessionThread messages={messages} />
      </div>
      <SessionStatusBar
        tokens={parsed.label !== '0' ? formatTokenLabel(parsed.used) : session.tokens}
        duration={duration}
        percent={percent}
        status={session.active ? 'Active' : 'Idle'}
      />
      <div className="px-6">
        {!prHidden && pr && (
          <SessionPrChip number={pr.number} repo={pr.repo} href={pr.htmlUrl} additions={pr.additions} deletions={pr.deletions} onDismiss={onDismissPr} />
        )}
        {isTreeKind(session.sessionKind) ? (
          <HandoffBanner
            sessionId={conversation.id}
            sourceKind={session.sessionKind}
            sourceId={session.sessionId}
            title={title}
            project={session.workingDir || project}
            excerpt={transcriptExcerpt(messages)}
            percent={percent}
            onComplete={onHandoff}
          />
        ) : null}
      </div>
    </div>
  )
}

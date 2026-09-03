'use client'

import { useTranslations } from 'next-intl'
import { relativeTime, sessionStatusPill, pullStatusLabel, type PullStatus } from '@/lib/chat-display'
import { IconChevron } from '../desktop/chat-icons'
import type { ChatPullRequest } from '@/lib/github-pulls'

export interface HomeSessionRow {
  id: string
  title: string
  subtitle: string
  repo: string
  updatedAt: number
  active: boolean
  hasPr: boolean
  prState?: string | null
}

const ROW =
  'flex w-full items-center gap-3 rounded-xl bg-[var(--chat-elevated)] px-3 py-2.5 text-left hover:bg-white/5'

function pillClass(kind: string): string {
  if (kind === 'ready_for_review' || kind === 'open') return 'text-[var(--chat-accent)]'
  if (kind === 'merged') return 'text-purple-300'
  if (kind === 'closed') return 'text-[var(--chat-danger)]'
  if (kind === 'active') return 'text-[var(--chat-success)]'
  return 'text-[var(--chat-muted)]'
}

export function ChatHomeList({
  sessions,
  pullRequests,
  onSelectSession,
}: {
  sessions: HomeSessionRow[]
  pullRequests: ChatPullRequest[]
  onSelectSession: (id: string) => void
}) {
  const t = useTranslations('chatDesktop')
  return (
    <div className="mx-auto w-full max-w-3xl px-8">
      <section className="mb-8">
        <h2 className="mb-2 text-[13px] font-medium text-[var(--chat-text)]">{t('sessions')}</h2>
        {sessions.length === 0 ? (
          <p className="text-[13px] text-[var(--chat-muted)]">{t('noSessions')}</p>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((row) => {
              const pill = sessionStatusPill(row)
              return (
                <button key={row.id} type="button" className={ROW} onClick={() => onSelectSession(row.id)}>
                  <span className={`shrink-0 text-[12px] ${pillClass(pill)}`}>
                    {t(`sessionPill.${pill}`)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--chat-text)]">{row.title}</span>
                  <span className="hidden max-w-[180px] truncate text-[12px] text-[var(--chat-muted)] sm:block">{row.subtitle}</span>
                  <span className="hidden text-[12px] text-[var(--chat-muted)] md:block">{row.repo}</span>
                  <span className="text-[12px] text-[var(--chat-muted)]">{relativeTime(row.updatedAt)}</span>
                  <IconChevron />
                </button>
              )
            })}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-[13px] font-medium text-[var(--chat-text)]">{t('pullRequests')}</h2>
        {pullRequests.length === 0 ? (
          <p className="text-[13px] text-[var(--chat-muted)]">{t('noPullRequests')}</p>
        ) : (
          <div className="space-y-1.5">
            {pullRequests.map((pr) => (
              <a
                key={`${pr.repo}-${pr.number}`}
                href={pr.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={ROW}
              >
                <span className={`shrink-0 text-[12px] ${pillClass(pr.state)}`}>
                  {pullStatusLabel(pr.state as PullStatus)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--chat-text)]">{pr.title}</span>
                <span className="text-[12px] text-[var(--chat-muted)]">#{pr.number}</span>
                <span className="hidden text-[12px] text-[var(--chat-muted)] md:block">{pr.repo.split('/')[1]}</span>
                <span className="text-[12px] text-[var(--chat-muted)]">{relativeTime(Date.parse(pr.updatedAt) / 1000)}</span>
                <IconChevron />
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

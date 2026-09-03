'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { extractApiErrorMessage } from '@/lib/api-error-message'
import type { Conversation } from '@/store'
import type { SessionTranscriptMessage } from './session-message'

const ACTIVE_MS = 1500
const IDLE_MS = 8000

function transcriptUrl(session: NonNullable<Conversation['session']>): string {
  if (session.sessionKind === 'gateway') {
    return `/api/sessions/transcript/gateway?key=${encodeURIComponent(session.sessionKey || session.sessionId)}&limit=50`
  }
  return `/api/sessions/transcript?kind=${encodeURIComponent(session.sessionKind)}&id=${encodeURIComponent(session.sessionId)}&limit=40&live=1`
}

function fingerprint(messages: SessionTranscriptMessage[]): string {
  const last = messages[messages.length - 1]
  return `${messages.length}:${last?.timestamp || ''}:${last?.parts.length || 0}`
}

export function useSessionTranscript(session: Conversation['session'] | undefined) {
  const [messages, setMessages] = useState<SessionTranscriptMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const print = useRef('')
  const sessionRef = useRef(session)
  sessionRef.current = session
  const sessionId = session?.sessionId
  const sessionKind = session?.sessionKind
  const active = !!session?.active

  const load = useCallback(async (initial: boolean) => {
    const current = sessionRef.current
    if (!current || inFlight.current) return
    inFlight.current = true
    if (initial) setLoading(true)
    try {
      const data = await apiFetch<{ messages?: SessionTranscriptMessage[] }>(transcriptUrl(current))
      const next = Array.isArray(data?.messages) ? data.messages : []
      const mark = fingerprint(next)
      if (mark !== print.current) {
        print.current = mark
        setMessages(next)
      }
      setError(null)
    } catch (err) {
      if (initial) {
        setMessages([])
        setError(extractApiErrorMessage(err, 'Failed to load transcript'))
      }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    print.current = ''
    setMessages([])
    setError(null)
    if (!sessionId || !sessionKind) return
    void load(true)
    const tick = () => {
      if (document.visibilityState === 'hidden') return
      void load(false)
    }
    const id = window.setInterval(tick, active ? ACTIVE_MS : IDLE_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [sessionId, sessionKind, active, load])

  const refresh = useCallback(() => { void load(false) }, [load])
  return { messages, loading, error, refresh }
}

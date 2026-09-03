'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { extractApiErrorMessage } from '@/lib/api-error-message'
import type { Conversation } from '@/store'
import type { SessionTranscriptMessage } from './session-message'

export function useSessionTranscript(session: Conversation['session'] | undefined) {
  const [messages, setMessages] = useState<SessionTranscriptMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!session) {
      setMessages([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const url = session.sessionKind === 'gateway'
      ? `/api/sessions/transcript/gateway?key=${encodeURIComponent(session.sessionKey || session.sessionId)}&limit=50`
      : `/api/sessions/transcript?kind=${encodeURIComponent(session.sessionKind)}&id=${encodeURIComponent(session.sessionId)}&limit=40`

    apiFetch<{ messages?: SessionTranscriptMessage[] }>(url)
      .then((data) => {
        if (!cancelled) setMessages(Array.isArray(data?.messages) ? data.messages : [])
      })
      .catch((err) => {
        if (cancelled) return
        setMessages([])
        setError(extractApiErrorMessage(err, 'Failed to load transcript'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, nonce])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])
  return { messages, loading, error, refresh }
}

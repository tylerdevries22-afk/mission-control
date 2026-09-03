'use client'

import { useCallback, useEffect } from 'react'
import { useMissionControl, type Agent } from '@/store'
import { apiFetch } from '@/lib/api-client'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { createClientLogger } from '@/lib/client-logger'
import { mapProviderSessions, readSessionPrefs, readSessions } from '@/lib/chat-session-map'

const log = createClientLogger('useChatConversations')

export function useChatConversations() {
  const { conversations, setConversations, agents, setAgents } = useMissionControl()

  const loadConversations = useCallback(async () => {
    try {
      const [sessionsData, prefs] = await Promise.all([
        apiFetch<unknown>('/api/sessions').then(readSessions).catch(() => []),
        apiFetch<unknown>('/api/chat/session-prefs').then(readSessionPrefs).catch(() => ({})),
      ])
      setConversations(mapProviderSessions(sessionsData, prefs))
    } catch (err) {
      log.error('Failed to load conversations:', err)
    }
  }, [setConversations])

  useSmartPoll(loadConversations, 30000, { pauseWhenSseConnected: true })

  useEffect(() => {
    apiFetch<{ agents?: Agent[] }>('/api/agents')
      .then((data) => {
        if (data.agents) setAgents(data.agents)
      })
      .catch((err) => log.error('Failed to load agents:', err))
  }, [setAgents])

  return { conversations, agents, reload: loadConversations }
}

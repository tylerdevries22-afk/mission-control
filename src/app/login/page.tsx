'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { LanguageSwitcherSelect } from '@/components/ui/language-switcher'
import { DesktopBrowserLogin } from '@/components/auth/desktop-browser-login'
import { apiFetch } from '@/lib/api-client'
import { requestLogin, type LoginRequestBody } from '@/lib/login-request'
import { safeLoginDestination } from '@/lib/login-redirect'
import { LoginGatewaySettings } from '@/components/auth/login-gateway-settings'
import { LoginNotices } from '@/components/auth/login-notices'
import { GoogleLogin } from '@/components/auth/google-login'
import { LoginCredentialsForm } from '@/components/auth/login-credentials-form'

type LoginErrorPayload = {
  code?: string
  error?: string
  hint?: string
}

function readLoginErrorPayload(value: unknown): LoginErrorPayload {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return {
    code: typeof record.code === 'string' ? record.code : undefined,
    error: typeof record.error === 'string' ? record.error : undefined,
    hint: typeof record.hint === 'string' ? record.hint : undefined,
  }
}

export default function LoginPage() {
  const t = useTranslations('auth')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pendingApproval, setPendingApproval] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)


  const finishAuthentication = useCallback(() => {
    const candidate = new URLSearchParams(window.location.search).get('next')
    const destination = safeLoginDestination(candidate, window.location.origin)
    // A full reload ensures the new HttpOnly session is used for every request.
    window.location.href = destination
  }, [])

  // Check if first-time setup is needed on page load — auto-redirect to /setup
  useEffect(() => {
    apiFetch<{ needsSetup?: boolean }>('/api/setup', {
      redirectOnUnauthenticated: false,
    })
      .then((data) => {
        if (data.needsSetup) {
          // A document reload is required to leave the authenticated app shell.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/setup'
        }
      })
      .catch(() => {
        // Ignore — setup check is best-effort
      })
  }, [])

  const completeLogin = useCallback(async (path: string, body: LoginRequestBody) => {
    const res = await requestLogin(path, body)

    if (!res.ok) {
      const data = readLoginErrorPayload(res.data)
      if (data.code === 'PENDING_APPROVAL') {
        setPendingApproval(true)
        setNeedsSetup(false)
        setError('')
        setLoading(false)
        setGoogleLoading(false)
        return false
      }
      if (data.code === 'NO_USERS') {
        setNeedsSetup(true)
        setError('')
        setLoading(false)
        setGoogleLoading(false)
        return false
      }
      setError(data.error || t('loginFailed'))
      setPendingApproval(false)
      setNeedsSetup(false)
      setLoading(false)
      setGoogleLoading(false)
      return false
    }

    finishAuthentication()
    return true
  }, [finishAuthentication, t])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Read DOM values directly to handle browser autofill (which doesn't fire onChange)
    const form = e.target as HTMLFormElement
    const formUsername = (form.elements.namedItem('username') as HTMLInputElement)?.value || username
    const formPassword = (form.elements.namedItem('password') as HTMLInputElement)?.value || password

    try {
      await completeLogin('/api/auth/login', { username: formUsername, password: formPassword })
    } catch {
      setError(t('networkError'))
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcherSelect />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-background border border-border/50 flex items-center justify-center mb-3">
            <Image
              src="/brand/mc-logo-128.png"
              alt="Mission Control logo"
              width={48}
              height={48}
              className="h-full w-full object-cover"
              priority
              unoptimized
            />
          </div>
          <h1 className="text-xl font-semibold text-foreground">{t('missionControl')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('signInToContinue')}</p>
        </div>

        <LoginNotices pendingApproval={pendingApproval} needsSetup={needsSetup} error={error}
          onRetry={() => { setPendingApproval(false); setError(''); setGoogleLoading(false) }} />

        <LoginGatewaySettings />

        <div className={pendingApproval ? 'opacity-50 pointer-events-none' : ''}>
          <DesktopBrowserLogin
            onAuthenticated={finishAuthentication}
            disabled={loading || googleLoading}
          />
          <div className="my-4 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or use account credentials</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        <GoogleLogin pendingApproval={pendingApproval} loading={loading} googleLoading={googleLoading}
          setGoogleLoading={setGoogleLoading} setError={setError} completeLogin={completeLogin} />

        <LoginCredentialsForm username={username} password={password} setUsername={setUsername}
          setPassword={setPassword} loading={loading} pendingApproval={pendingApproval} handleSubmit={handleSubmit} />

        <p className="text-center text-xs text-muted-foreground mt-6">{t('orchestrationTagline')}</p>
      </div>
    </main>
  )
}

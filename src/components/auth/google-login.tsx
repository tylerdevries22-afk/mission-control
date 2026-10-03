'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LoginRequestBody } from '@/lib/login-request'

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleAccountsIdApi {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
  }): void
  prompt(): void
}

interface GoogleApi {
  accounts: {
    id: GoogleAccountsIdApi
  }
}

declare global {
  interface Window {
    google?: GoogleApi
  }
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

interface Props {
  pendingApproval: boolean
  loading: boolean
  googleLoading: boolean
  setGoogleLoading(value: boolean): void
  setError(value: string): void
  completeLogin(path: string, body: LoginRequestBody): Promise<boolean>
}

export function GoogleLogin({ pendingApproval, loading, googleLoading, setGoogleLoading, setError, completeLogin }: Props) {
  const t = useTranslations('auth')
  const tc = useTranslations('common')
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
  const [googleReady, setGoogleReady] = useState(false)
  const googleCallbackRef = useRef<((response: GoogleCredentialResponse) => void) | null>(null)
  // Initialize Google Sign-In SDK (hidden prompt mode)
  useEffect(() => {
    if (!googleClientId) return

    const onScriptLoad = () => {
      if (!window.google) return
      googleCallbackRef.current = async (response: GoogleCredentialResponse) => {
        setError('')
        setGoogleLoading(true)
        try {
          const ok = await completeLogin('/api/auth/google', { credential: response?.credential })
          if (!ok) return
        } catch {
          setError(t('googleSignInFailed'))
          setGoogleLoading(false)
        }
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: GoogleCredentialResponse) => googleCallbackRef.current?.(response),
      })
      setGoogleReady(true)
    }

    const existing = document.querySelector('script[data-google-gsi="1"]') as HTMLScriptElement | null
    if (existing) {
      if (window.google) onScriptLoad()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.setAttribute('data-google-gsi', '1')
    script.onload = onScriptLoad
    script.onerror = () => setError(t('googleSignInFailed'))
    document.head.appendChild(script)
  }, [googleClientId, completeLogin, t, setError, setGoogleLoading])

  const handleGoogleSignIn = () => {
    if (!window.google || !googleReady) return
    window.google.accounts.id.prompt()
  }

  return (
    <>
        {/* Google Sign-In button — shown only when client ID is configured */}
        {googleClientId && (
          <div className={pendingApproval ? 'opacity-50 pointer-events-none' : ''}>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={!googleReady || googleLoading || loading}
              className="w-full h-10 flex items-center justify-center gap-3 rounded-lg border border-border bg-white text-[#3c4043] text-sm font-medium hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  {t('signingIn')}
                </>
              ) : (
                <>
                  <GoogleIcon className="w-[18px] h-[18px]" />
                  {t('signInWithGoogle')}
                </>
              )}
            </button>
            {!googleReady && (
              <p className="text-center text-xs text-muted-foreground mt-2">{t('loadingGoogleSignIn')}</p>
            )}

            {/* Divider */}
            <div className="my-4 flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{tc('or')}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

    </>
  )
}

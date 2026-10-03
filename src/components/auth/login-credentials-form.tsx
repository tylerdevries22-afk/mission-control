'use client'

import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface Props {
  username: string
  password: string
  setUsername(value: string): void
  setPassword(value: string): void
  loading: boolean
  pendingApproval: boolean
  handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void>
}
export function LoginCredentialsForm({ username, password, setUsername, setPassword, loading, pendingApproval, handleSubmit }: Props) {
  const t = useTranslations('auth')
  return (
        <form onSubmit={handleSubmit} className={`space-y-4 ${pendingApproval ? 'opacity-50 pointer-events-none' : ''}`}>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1.5">{t('username')}</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/50 focus:border-primary transition-smooth"
              placeholder={t('enterUsername')}
              autoComplete="username"
              autoFocus
              required
              aria-required="true"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">{t('password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/50 focus:border-primary transition-smooth"
              placeholder={t('enterPassword')}
              autoComplete="current-password"
              required
              aria-required="true"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="w-full rounded-lg"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                {t('signingIn')}
              </>
            ) : (
              t('signIn')
            )}
          </Button>
        </form>

  )
}

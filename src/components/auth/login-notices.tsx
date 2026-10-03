'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

interface Props { pendingApproval: boolean; needsSetup: boolean; error: string; onRetry(): void }
export function LoginNotices({ pendingApproval, needsSetup, error, onRetry }: Props) {
  const t = useTranslations('auth')
  return (
    <>
        {pendingApproval && (
          <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
            <div className="flex justify-center mb-2">
              <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
            </div>
            <div className="text-sm font-medium text-amber-200">{t('accessRequestSubmitted')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('accessRequestDescription')}
            </p>
            <Button
              onClick={onRetry}
              variant="ghost"
              size="sm"
              className="mt-3 text-xs"
            >
              {t('tryAgain')}
            </Button>
          </div>
        )}

        {needsSetup && (
          <div className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
            <div className="flex justify-center mb-2">
              <svg className="w-8 h-8 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="text-sm font-medium text-blue-200">{t('noAdminAccount')}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('noAdminDescription')}
            </p>
            <Button
              onClick={() => {
                // A document reload is required to leave the authenticated app shell.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.href = '/setup'
              }}
              size="sm"
              className="mt-3"
            >
              {t('createAdminAccount')}
            </Button>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {error}
          </div>
        )}

    </>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { GATEWAY_URL_PRESETS, useLoginGateway } from './use-login-gateway'

export function LoginGatewaySettings() {
  const t = useTranslations('auth')
  const { advancedOpen, setAdvancedOpen, gatewayPreset, gatewayCustom, connectionStatus, connectionError,
    getEffectiveGatewayUrl, handleGatewayUrlChange, handleGatewayCustomChange, handleTestConnection } = useLoginGateway()
  return (
    <>
        {/* Advanced Settings — WebSocket gateway URL configuration */}
        <div className="mb-4 rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setAdvancedOpen(o => !o)}
            className="w-full px-3 py-2 flex items-center justify-between text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
          >
            <span>{t('advancedSettings')}</span>
            <svg
              className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>

          {advancedOpen && (
            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border">
              <div>
                <label htmlFor="gateway-url" className="block text-sm font-medium text-foreground mb-1.5">
                  {t('gatewayUrl')}
                </label>
                <div className="flex gap-2">
                  <select
                    id="gateway-url"
                    value={gatewayPreset}
                    onChange={e => handleGatewayUrlChange(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/50 focus:border-primary transition-smooth appearance-none cursor-pointer"
                  >
                    {GATEWAY_URL_PRESETS.map(url => (
                      <option key={url} value={url}>{url}</option>
                    ))}
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {gatewayPreset === 'custom' && (
                  <input
                    type="text"
                    value={gatewayCustom}
                    onChange={e => handleGatewayCustomChange(e.target.value)}
                    placeholder={t('gatewayUrlPlaceholder')}
                    className="mt-2 w-full h-10 px-3 rounded-lg bg-secondary border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/50 focus:border-primary transition-smooth"
                  />
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={connectionStatus === 'testing' || !getEffectiveGatewayUrl()}
                  className="h-9 px-3 rounded-lg bg-secondary border border-border text-foreground text-sm hover:bg-muted-foreground/10 focus:outline-hidden focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {connectionStatus === 'testing' ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-muted-foreground/40 border-t-muted-foreground rounded-full animate-spin" />
                      {t('testConnection')}...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13.5 2.5L2.5 13.5M13.5 2.5l-4 4m4-4l-4-4m4 4l-4 4" />
                      </svg>
                      {t('testConnection')}
                    </>
                  )}
                </button>

                {connectionStatus === 'success' && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 3L6 10l-3-3" />
                    </svg>
                    {t('connectionSuccess')}
                  </span>
                )}
                {connectionStatus === 'failed' && (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 4L4 12M4 4l8 8" />
                    </svg>
                    {t('connectionFailed')}{connectionError ? `: ${connectionError}` : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

    </>
  )
}

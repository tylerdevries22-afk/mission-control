'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/api-client'
import { EngineLogo } from '@/components/brand/engine-logo'
import { MODEL_CATALOG, type ModelConfig } from '@/lib/models'
import {
  ENGINE_META,
  accessibleModels,
  engineForProvider,
  type EngineId,
  type ProviderAccess,
} from '@/lib/chat-model-groups'
import { modelPickerLabel } from '@/lib/chat-display'
import { IconCheck } from '../desktop/chat-icons'

export const HANDOFF_ENGINES: EngineId[] = ['claude', 'codex', 'grok', 'kimi']

export function HandoffPicker({
  onConfirm,
  busy,
}: {
  onConfirm: (engine: EngineId, model: string) => void
  busy: boolean
}) {
  const t = useTranslations('chatDesktop')
  const [access, setAccess] = useState<ProviderAccess>({})
  const [engine, setEngine] = useState<EngineId>('claude')
  const [model, setModel] = useState(ENGINE_META.claude.defaultAlias)
  const models = modelsFor(engine, access)

  useEffect(() => {
    apiFetch<{ providers?: ProviderAccess }>('/api/models/access')
      .then((data) => setAccess(data.providers && typeof data.providers === 'object' ? data.providers : {}))
      .catch(() => setAccess({}))
  }, [])

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-[280px] rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elevated)] p-2 shadow-2xl">
      <div className="mb-1 grid grid-cols-4 gap-1">
        {HANDOFF_ENGINES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setEngine(id)
              setModel(ENGINE_META[id].defaultAlias)
            }}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[11px] duration-200 hover:bg-white/5 ${engine === id ? 'bg-white/8 text-[var(--chat-text)]' : 'text-[var(--chat-muted)]'}`}
            aria-pressed={engine === id}
            aria-label={ENGINE_META[id].label}
          >
            <EngineLogo engine={id} size={16} />
            {ENGINE_META[id].label}
          </button>
        ))}
      </div>
      <div className="max-h-40 overflow-y-auto">
        {models.map((item) => (
          <button
            key={item.alias}
            type="button"
            onClick={() => setModel(item.alias)}
            className="flex h-8 w-full cursor-pointer items-center justify-between rounded-md px-2 text-[12px] text-[var(--chat-text)] duration-200 hover:bg-white/5"
          >
            <span className="truncate">{modelPickerLabel(item.alias, item.name)}</span>
            {model === item.alias ? <IconCheck /> : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onConfirm(engine, model)}
        className="mt-2 flex h-8 w-full cursor-pointer items-center justify-center rounded-md bg-white/10 text-[13px] text-[var(--chat-text)] duration-200 hover:bg-white/15 disabled:opacity-40"
      >
        {t('handoff')}
      </button>
    </div>
  )
}

function modelsFor(engine: EngineId, access: ProviderAccess): ModelConfig[] {
  const catalog = accessibleModels(access, MODEL_CATALOG)
  const grouped = catalog.filter((item) => engineForProvider(item.provider) === engine)
  return grouped.length > 0 ? grouped : MODEL_CATALOG.filter((item) => engineForProvider(item.provider) === engine)
}

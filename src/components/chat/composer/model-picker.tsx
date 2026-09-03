'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { getAllModels } from '@/lib/models'
import { modelPickerLabel } from '@/lib/chat-display'
import { IconCheck } from '../desktop/chat-icons'

const PRIMARY = new Set(['opus', 'sonnet', 'haiku', 'gpt-4.1'])

export function ModelPicker({
  value,
  onChange,
  fastMode,
  onFastMode,
  onClose,
}: {
  value: string
  onChange: (alias: string) => void
  fastMode: boolean
  onFastMode: (next: boolean) => void
  onClose: () => void
}) {
  const t = useTranslations('chatDesktop')
  const ref = useRef<HTMLDivElement>(null)
  const models = getAllModels()
  const primary = models.filter((model) => PRIMARY.has(model.alias))
  const rest = models.filter((model) => !PRIMARY.has(model.alias))

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-12 left-0 z-30 w-[280px] rounded-xl border border-[var(--chat-border)] bg-[var(--chat-elevated)] p-2 shadow-2xl"
    >
      <p className="px-2 pb-2 text-[12px] text-[var(--chat-muted)]">{t('modelHint')}</p>
      {primary.map((model) => (
        <button
          key={model.alias}
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md px-2 text-[13px] text-[var(--chat-text)] hover:bg-white/5"
          onClick={() => {
            onChange(model.alias)
            onClose()
          }}
        >
          <span>
            {modelPickerLabel(model.alias, model.name)}
            <span className="ml-2 text-[11px] text-[var(--chat-muted)]">{model.description}</span>
          </span>
          {value === model.alias && <IconCheck />}
        </button>
      ))}
      <details className="mt-1">
        <summary className="cursor-pointer px-2 py-1.5 text-[13px] text-[var(--chat-muted)]">{t('moreModels')}</summary>
        {rest.map((model) => (
          <button
            key={model.alias}
            type="button"
            className="flex h-8 w-full items-center justify-between rounded-md px-2 text-[13px] hover:bg-white/5"
            onClick={() => {
              onChange(model.alias)
              onClose()
            }}
          >
            <span>{modelPickerLabel(model.alias, model.name)}</span>
            {value === model.alias && <IconCheck />}
          </button>
        ))}
      </details>
      <div className="mt-1 flex items-center justify-between border-t border-[var(--chat-border)] px-2 py-2 text-[13px]">
        <span>{t('fastMode')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={fastMode}
          onClick={() => onFastMode(!fastMode)}
          className={`relative h-5 w-9 rounded-full ${fastMode ? 'bg-[var(--chat-accent)]' : 'bg-white/15'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${fastMode ? 'left-4' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  )
}

'use client'

import Image from 'next/image'
import { ENGINE_META, engineFromKind, inferEngineFromText, type EngineId } from '@/lib/chat-model-groups'

export function EngineLogo({
  engine,
  size = 16,
  className = '',
}: {
  engine: EngineId
  size?: number
  className?: string
}) {
  const meta = ENGINE_META[engine]
  return (
    <Image
      src={meta.logo}
      alt={meta.label}
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 rounded-[4px] object-cover ${className}`}
    />
  )
}

export function EngineLogoForText({
  text,
  size = 16,
  className = '',
}: {
  text: string | undefined | null
  size?: number
  className?: string
}) {
  const engine = inferEngineFromText(text)
  if (!engine) return null
  return <EngineLogo engine={engine} size={size} className={className} />
}

export function EngineLogoSet({
  kinds,
  size = 14,
}: {
  kinds: Array<string | undefined>
  size?: number
}) {
  const engines = Array.from(new Set(kinds.map((kind) => engineFromKind(kind)).filter((engine): engine is EngineId => Boolean(engine))))
  if (engines.length === 0) return null
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {engines.map((engine) => (
        <EngineLogo key={engine} engine={engine} size={size} />
      ))}
    </span>
  )
}

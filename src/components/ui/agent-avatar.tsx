'use client'

import { brandFromAgent, brandLogo } from '@/lib/agent-brand'

interface AgentAvatarProps {
  name?: string | null
  runtimeType?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

function getInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function getAvatarColors(name: string): { backgroundColor: string; color: string } {
  const hash = hashString((name ?? '').toLowerCase())
  const hue = hash % 360
  return {
    backgroundColor: `hsl(${hue} 70% 38%)`,
    color: 'hsl(0 0% 98%)',
  }
}

const sizeClasses: Record<NonNullable<AgentAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-10 h-10 text-sm',
}

export function AgentAvatar({
  name,
  runtimeType,
  size = 'sm',
  className = '',
}: AgentAvatarProps) {
  const safeName = name ?? ''
  const logo = brandLogo(brandFromAgent(safeName, runtimeType))
  const box = `rounded-full flex items-center justify-center font-semibold shrink-0 overflow-hidden border border-border/50 ${sizeClasses[size]} ${className}`

  if (logo) {
    return (
      <div className={`${box} bg-surface-2`} title={safeName} aria-label={safeName || logo.alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt={logo.alt} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div
      className={box}
      style={getAvatarColors(safeName)}
      title={safeName}
      aria-label={safeName || 'Agent'}
    >
      {getInitials(safeName)}
    </div>
  )
}

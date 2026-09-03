'use client'

export function ChatShell({
  sidebar,
  main,
  plan,
}: {
  sidebar: React.ReactNode
  main: React.ReactNode
  plan?: React.ReactNode
}) {
  return (
    <div className="relative z-10 flex h-full min-h-0 bg-[var(--chat-bg)]">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--chat-bg)]">{main}</div>
      {plan}
    </div>
  )
}

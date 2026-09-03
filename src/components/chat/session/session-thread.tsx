'use client'

import { MarkdownRenderer } from '@/components/markdown-renderer'
import type { SessionTranscriptMessage } from '../session-message'
import { SessionToolRow } from './session-tool-row'

export function SessionThread({ messages }: { messages: SessionTranscriptMessage[] }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-8 py-6">
      {messages.map((message, index) => (
        <article key={`${message.timestamp || 'row'}-${index}`} className="text-[15px] leading-[1.65] text-[var(--chat-text)]">
          {message.parts.map((part, partIndex) => {
            if (part.type === 'text') {
              return (
                <div key={partIndex} className="chat-plan-prose">
                  <MarkdownRenderer content={part.text} />
                </div>
              )
            }
            if (part.type === 'thinking') {
              return (
                <SessionToolRow key={partIndex} label="Thinking">
                  {part.thinking}
                </SessionToolRow>
              )
            }
            if (part.type === 'tool_use') {
              return (
                <SessionToolRow key={partIndex} label={part.name} detail={part.input}>
                  {part.input}
                </SessionToolRow>
              )
            }
            return (
              <SessionToolRow
                key={partIndex}
                label={part.isError ? 'Error' : 'Result'}
                detail={`${part.content.length} chars`}
              >
                {part.content}
              </SessionToolRow>
            )
          })}
        </article>
      ))}
    </div>
  )
}

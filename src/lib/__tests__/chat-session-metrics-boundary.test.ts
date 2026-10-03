import { describe, expect, it } from 'vitest'
import { contextPercent, parseSessionTokens, parseTokenCount } from '@/lib/chat-session-metrics'

describe('session metrics input bounds', () => {
  it.each(['('.repeat(100_000), '9'.repeat(100_000), '10k/100k (' + '('.repeat(100_000)])(
    'rejects oversized metric strings before regex/numeric work', input => {
      expect(parseTokenCount(input)).toBe(0)
      expect(parseSessionTokens(input)).toEqual({ used: 0, window: 0, percent: 0, label: '0' })
      expect(contextPercent(input)).toBeNull()
    },
  )

  it('retains normal, annotated and incomplete metric behavior', () => {
    expect(parseSessionTokens('10k/100k (10%)')).toMatchObject({ used: 10_000, window: 100_000, percent: 10 })
    expect(contextPercent('10k/100k (10%)')).toBe(10)
    expect(parseSessionTokens('10k/100k (')).toMatchObject({ used: 10_000, window: 0 })
  })
})

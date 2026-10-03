import { describe, expect, it } from 'vitest'
import { safeLoginDestination } from '@/lib/login-redirect'

describe('login redirect boundary', () => {
  it.each([null, undefined, 1, '', 'https://evil.example', '//evil.example',
    '/\\evil.example', '/\\/evil.example', '/\t/evil.example', '/\r\n/evil.example',
    '\\evil.example', 'javascript:alert(1)', ' /tasks', '/' + 'a'.repeat(4096)])(
    'rejects external, ambiguous or oversized destinations: %s', candidate => {
      expect(safeLoginDestination(candidate, 'https://mission.example:4000')).toBe('/')
    },
  )

  it.each(['/tasks', '/tasks?status=open#details', '/agents/%E2%9C%93', '/%2F%2Fevil.example'])(
    'preserves local paths without decoding them: %s', candidate => {
      expect(safeLoginDestination(candidate, 'https://mission.example:4000')).toBe(candidate)
    },
  )

  it('normalizes local parent segments and fails closed for invalid base URLs', () => {
    expect(safeLoginDestination('/tasks/../agents', 'http://localhost:4000')).toBe('/agents')
    expect(safeLoginDestination('/tasks', 'invalid')).toBe('/')
    expect(safeLoginDestination('/tasks', 'file:///tmp')).toBe('/')
  })
})

import { describe, expect, it } from 'vitest'
import { isSafeHomePath } from '../safe-home-path'

describe('isSafeHomePath', () => {
  it('allows the home directory and children, rejects escapes', () => {
    expect(isSafeHomePath('/Users/dev', '/Users/dev')).toBe(true)
    expect(isSafeHomePath('/Users/dev/app', '/Users/dev')).toBe(true)
    expect(isSafeHomePath('/etc', '/Users/dev')).toBe(false)
    expect(isSafeHomePath('/Users/dev/../etc', '/Users/dev')).toBe(false)
    expect(isSafeHomePath('', '/Users/dev')).toBe(false)
  })
})

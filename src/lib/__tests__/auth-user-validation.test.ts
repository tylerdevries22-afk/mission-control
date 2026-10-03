import { describe, expect, it } from 'vitest'
import { deleteAuthUserSchema, updateAuthUserSchema } from '@/lib/auth-user-validation'

describe('user mutation boundaries', () => {
  it.each(['1abc', -1, 1.5, null, true, '0', Number.MAX_SAFE_INTEGER + 1])('rejects an invalid user ID: %s', id => {
    expect(updateAuthUserSchema.safeParse({ id }).success).toBe(false)
    expect(deleteAuthUserSchema.safeParse({ id }).success).toBe(false)
  })

  it('accepts exact numeric IDs and preserves blank-password profile edits', () => {
    expect(deleteAuthUserSchema.parse({ id: '7' })).toEqual({ id: 7 })
    expect(updateAuthUserSchema.parse({ id: 7, password: '' })).toEqual({ id: 7, password: undefined })
  })

  it.each([{ password: 'short' }, { password: 123 }, { is_approved: '0' }, { role: 'owner' }, { display_name: {} }])(
    'rejects invalid identity updates: %o', update => {
      expect(updateAuthUserSchema.safeParse({ id: 7, ...update }).success).toBe(false)
    },
  )

  it('allows a strong password and rejects undeclared fields', () => {
    expect(updateAuthUserSchema.safeParse({ id: 7, password: 'a-new-test-password', is_approved: 0 }).success).toBe(true)
    expect(updateAuthUserSchema.safeParse({ id: 7, tenant_id: 99 }).success).toBe(false)
  })
})

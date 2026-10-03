import { z } from 'zod'

const userId = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/).transform(Number)])
  .refine(Number.isSafeInteger, 'Invalid user ID')
const optionalPassword = z.string().max(1024).transform(value => value || undefined)
  .refine(value => value === undefined || value.length >= 12, 'Password must be at least 12 characters')
  .optional()

export const updateAuthUserSchema = z.object({
  id: userId,
  display_name: z.string().max(200).optional(),
  role: z.enum(['admin', 'operator', 'viewer']).optional(),
  password: optionalPassword,
  is_approved: z.union([z.literal(0), z.literal(1)]).optional(),
  email: z.string().max(320).nullable().optional(),
  avatar_url: z.string().max(2048).nullable().optional(),
}).strict()

export const deleteAuthUserSchema = z.object({ id: userId }).strict()

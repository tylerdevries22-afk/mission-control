import { getDefaultWorkspaceContext } from './auth-context'
import { getUserFromRequest } from './auth-request'
import type { User } from './auth-types'

export type { User, UserSession } from './auth-types'
export { registerAuthResolver, safeCompare, hashApiKey } from './auth-keys'
export { createSession, validateSession, destroySession, destroyAllUserSessions } from './auth-sessions'
export { authenticateUser, getUserById, getAllUsers, createUser, updateUser, deleteUser } from './auth-users'
export { getUserFromRequest } from './auth-request'

export function getWorkspaceIdFromRequest(request: Request): number {
  const user = getUserFromRequest(request)
  return user?.workspace_id || getDefaultWorkspaceContext().workspaceId
}

export function getTenantIdFromRequest(request: Request): number {
  const user = getUserFromRequest(request)
  return user?.tenant_id || getDefaultWorkspaceContext().tenantId
}

/**
 * Role hierarchy levels for access control.
 * viewer < operator < admin
 */
export const ROLE_LEVELS: Record<string, number> = { viewer: 0, operator: 1, admin: 2 }

/**
 * Check if a user meets the minimum role requirement.
 * Returns { user } on success, or { error, status } on failure (401 or 403).
 */
export function requireRole(
  request: Request,
  minRole: User['role']
): { user: User; error?: never; status?: never } | { user?: never; error: string; status: 401 | 403 } {
  const user = getUserFromRequest(request)
  if (!user) {
    return { error: 'Authentication required', status: 401 }
  }
  if ((ROLE_LEVELS[user.role] ?? -1) < ROLE_LEVELS[minRole]) {
    return { error: `Requires ${minRole} role or higher`, status: 403 }
  }
  return { user }
}

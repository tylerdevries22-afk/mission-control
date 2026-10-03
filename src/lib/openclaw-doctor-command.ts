export function getCommandDetail(error: unknown): { detail: string; code: number | null } {
  const err = error as {
    stdout?: string
    stderr?: string
    message?: string
    code?: number | null
  }

  const output = [err?.stdout, err?.stderr].filter(value => typeof value === 'string' && value.trim()).join('\n').trim()
  return {
    detail: output || (typeof err?.message === 'string' ? err.message : ''),
    code: typeof err?.code === 'number' ? err.code : null,
  }
}

export function isMissingOpenClaw(detail: string): boolean {
  return /enoent|not installed|not reachable|command not found/i.test(detail)
}

export function isOpenClawMaintenanceContention(detail: string): boolean {
  return /StateDatabaseCoordinatorContentionError|another OpenClaw process owns/i.test(detail)
}

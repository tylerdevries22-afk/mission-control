import path from 'node:path'

export function isSafeHomePath(candidate: string, homeDir: string): boolean {
  if (!candidate || !homeDir) return false
  const resolved = path.resolve(candidate)
  const home = path.resolve(homeDir)
  return resolved === home || resolved.startsWith(`${home}${path.sep}`)
}

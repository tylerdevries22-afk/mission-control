import path from 'node:path'
import { stripDoctorGutter } from '@/lib/openclaw-doctor-info'

function normalizeFsPath(candidate: string): string {
  return path.resolve(candidate.trim())
}

function normalizeDisplayedPath(candidate: string, stateDir: string): string {
  const trimmed = candidate.trim()
  if (!trimmed) return trimmed
  if (trimmed === '~/.openclaw') return stateDir
  if (trimmed === '$OPENCLAW_HOME' || trimmed === '$OPENCLAW_HOME/.openclaw') return stateDir
  return trimmed
}

export function stripForeignStateDirectoryWarning(rawOutput: string, stateDir?: string): string {
  if (!stateDir) return rawOutput

  const normalizedStateDir = normalizeFsPath(stateDir)
  const lines = rawOutput.split(/\r?\n/)
  const kept: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const normalized = stripDoctorGutter(line)

    if (!/multiple state directories detected/i.test(normalized)) {
      kept.push(line)
      continue
    }

    const blockLines = [line]
    let cursor = index + 1
    while (cursor < lines.length) {
      const nextLine = lines[cursor] ?? ''
      const nextNormalized = stripDoctorGutter(nextLine)
      if (!nextNormalized) {
        blockLines.push(nextLine)
        cursor += 1
        continue
      }
      if (/^(active state dir:|[-*]\s+(?:\/|~\/|\$OPENCLAW_HOME)|\|)/i.test(nextNormalized)) {
        blockLines.push(nextLine)
        cursor += 1
        continue
      }
      break
    }

    const listedDirs = blockLines
      .map(stripDoctorGutter)
      .filter(entry => /^[-*]\s+/.test(entry))
      .map(entry => entry.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .map(entry => normalizeDisplayedPath(entry, normalizedStateDir))

    const foreignDirs = listedDirs.filter(entry => normalizeFsPath(entry) !== normalizedStateDir)
    const onlyForeignDirs = foreignDirs.length > 0

    if (!onlyForeignDirs) {
      kept.push(...blockLines)
    }

    index = cursor - 1
  }

  return kept.join('\n')
}


import { collectDoctorBullets } from '@/lib/openclaw-doctor-lines'
import { stripForeignStateDirectoryWarning } from '@/lib/openclaw-doctor-state'
import { isDoctorTitleLine, isInformationalDoctorLine, stripDoctorGutter } from '@/lib/openclaw-doctor-info'

export type OpenClawDoctorLevel = 'healthy' | 'warning' | 'error'
export type OpenClawDoctorCategory = 'config' | 'state' | 'security' | 'general'

export interface OpenClawDoctorStatus {
  level: OpenClawDoctorLevel
  category: OpenClawDoctorCategory
  healthy: boolean
  summary: string
  issues: string[]
  canFix: boolean
  raw: string
}

function normalizeLine(line: string): string {
  return stripDoctorGutter(line)
}

function isSessionAgingLine(line: string): boolean {
  return /^agent:[\w:-]+ \(\d+[mh] ago\)$/i.test(line)
}

function isPositiveOrInstructionalLine(line: string): boolean {
  return /^no .* warnings? detected/i.test(line) ||
    /^no issues/i.test(line) ||
    /^run:\s/i.test(line) ||
    /^fix:\s/i.test(line) ||
    /^all .* (healthy|ok|valid|passed)/i.test(line)
}

function isDecorativeLine(line: string): boolean {
  return /^[▄█▀░\s]+$/.test(line) ||
    /openclaw doctor/i.test(line) ||
    /🦞\s*openclaw\s*🦞/i.test(line) ||
    isDoctorTitleLine(line)
}

function isStateDirectoryListLine(line: string): boolean {
  return /^(?:\$OPENCLAW_HOME(?:\/\.openclaw)?|~\/\.openclaw|\/\S+)$/.test(line)
}

function detectCategory(raw: string, issues: string[]): OpenClawDoctorCategory {
  const haystack = `${raw}\n${issues.join('\n')}`.toLowerCase()

  if (/invalid config|config invalid|unrecognized key|invalid option/.test(haystack)) {
    return 'config'
  }

  if (/state integrity|orphan transcript|multiple state directories|session history|legacy session bindings/.test(haystack)) {
    return 'state'
  }

  if (/security audit|channel security|security /.test(haystack)) {
    return 'security'
  }

  return 'general'
}

export function parseOpenClawDoctorOutput(
  rawOutput: string,
  exitCode = 0,
  options: { stateDir?: string } = {}
): OpenClawDoctorStatus {
  const raw = stripForeignStateDirectoryWarning(rawOutput.trim(), options.stateDir).trim()
  const lines = raw
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)

  const issues = collectDoctorBullets(raw)
    .filter(line =>
      !isSessionAgingLine(line) &&
      !isStateDirectoryListLine(line) &&
      !isPositiveOrInstructionalLine(line) &&
      !isInformationalDoctorLine(line)
    )

  const hasFindings = issues.length > 0
  if (!hasFindings && exitCode !== 0) {
    issues.push('OpenClaw doctor could not complete. Check the runtime logs and try again.')
  }
  const findingText = issues.join('\n')
  let level: OpenClawDoctorLevel = 'healthy'
  if (exitCode !== 0 || /invalid config/i.test(findingText)) {
    level = 'error'
  } else if (issues.length > 0) {
    level = 'warning'
  }

  const category = detectCategory(raw, issues)

  const summary =
    level === 'healthy'
      ? 'OpenClaw doctor reports a healthy configuration.'
      : issues[0] ||
        lines.find(line =>
          !/^run:/i.test(line) &&
          !/^file:/i.test(line) &&
          !isSessionAgingLine(line) &&
          !isDecorativeLine(line)
        ) ||
        'OpenClaw doctor reported configuration issues.'

  const canFix = hasFindings && level !== 'healthy'

  return {
    level,
    category,
    healthy: level === 'healthy',
    summary,
    issues,
    canFix,
    raw,
  }
}

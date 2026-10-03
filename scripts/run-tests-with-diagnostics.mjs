import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const report = path.join(tmpdir(), `mission-control-vitest-${randomUUID()}.json`)
const result = spawnSync('pnpm', [
  'exec', 'vitest', 'run', '--reporter=json', `--outputFile=${report}`,
  ...process.argv.slice(2),
], { encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 })

let coverage
try {
  coverage = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8')).total
  console.log(`Coverage: ${['lines', 'functions', 'branches', 'statements'].map(key => `${key}=${coverage[key].pct}%`).join(', ')}`)
} catch { /* Vitest can fail before producing coverage. */ }

try {
  const data = JSON.parse(readFileSync(report, 'utf8'))
  const failed = data.testResults.flatMap(file => file.assertionResults)
    .filter(test => test.status === 'failed')
    .slice(0, 12)
  if (result.status === 0) {
    console.log(`Unit tests passed (${data.numPassedTests}/${data.numTotalTests})`)
  } else {
    const gateErrors = `${result.stdout || ''}\n${result.stderr || ''}`.split('\n')
      .filter(line => /coverage.*threshold|threshold.*coverage/i.test(line)).slice(0, 8)
    console.error(`error: Unit gate failed: ${failed.map(test => test.fullName).join(' | ') || gateErrors.join(' | ') || 'runner error'}`)
    const details = failed.map(test => `${test.fullName}: ${(test.failureMessages || []).join('\n')}`).join('\n')
    if (details) console.error(details.slice(0, 8000))
  }
} catch {
  console.error('error: Unit tests failed before a JSON report was produced')
} finally {
  rmSync(report, { force: true })
}

process.exit(result.status ?? 1)

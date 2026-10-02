import { createHash } from 'node:crypto'

const records = new WeakMap()
const stages = new Map([
  ['Repository fetch', 'repository_fetch'], ['Dependency setup', 'dependency_setup'],
  ['Browser setup', 'browser_setup'], ['Node availability', 'node_availability'],
  ['Package manager availability', 'package_manager_availability'], ['Chromium render smoke', 'chromium_smoke'],
  ['Verification smoke', 'verification_smoke'], ['Verification test', 'verification_test'],
  ['Verification lint', 'verification_lint'], ['Verification typecheck', 'verification_typecheck'],
  ['Verification build', 'verification_build'], ['Verification test:e2e', 'verification_test_e2e'],
])

function testFile(line) {
  const match = line.match(/^[✓×❯]\s+(\S+)\s+\((\d{1,8}) tests?[^)]*\)\s+(\d{1,9}(?:\.\d{1,3})?)ms(?:\s.*)?$/)
  if (!match) return null
  const id = createHash('sha256').update(match[1]).digest('hex').slice(0, 16)
  const outcome = line.startsWith('✓') ? 'passed' : 'failed'
  return `test_file ${outcome} id=${id} tests=${match[2]} duration_ms=${match[3]}`
}

function counters(line) {
  const match = line.match(/^(Test Files|Tests)\s+(.+)$/)
  if (!match) return null
  const counts = [...match[2].matchAll(/(\d{1,8})\s+(passed|failed|skipped|todo)\b/g)]
  if (!counts.length) return null
  const fields = counts.slice(0, 4).map(count => `${count[2]}=${count[1]}`).join(' ')
  return `${match[1] === 'Tests' ? 'tests' : 'test_files'} ${fields}`
}

const witnessPrefix = 'error: TypeScript worker witness '
const phases = ['configuration', 'program_creation', 'program_snapshot', 'program_matching', 'config', 'options',
  'global', 'global_initial_entry', 'global_initial_exit', 'target_loop_entry', 'target_loop_exit',
  'global_final_entry', 'global_final_exit', 'syntactic', 'semantic', 'declaration', 'normalization', 'source_verification']
const bounded = (value, max, min = 0) => Number.isSafeInteger(value) && value >= min && value <= max
const ordinal = value => value === null || bounded(value, Number.MAX_SAFE_INTEGER)
function validAt(value) {
  if (value === null) return true
  if (!Array.isArray(value) || value.length !== 5) return false
  return [bounded(value[0], 4096, 1), phases.includes(value[1]), ordinal(value[2]),
    value[3] === null || bounded(value[3], 255), bounded(value[4], 120000)].every(Boolean)
}
function validCg(value) {
  if (value === null) return true
  if (!Array.isArray(value) || value.length !== 7) return false
  return [null, 1, 2].includes(value[0]) && [null, 'local', 'hierarchy'].includes(value[1]) && value.slice(2).every(ordinal)
}
function validWitness(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return [Object.keys(value).length === 4, ['reason', 'signal', 'at', 'cg'].every(key => Object.hasOwn(value, key)),
    ['worker_timeout', 'abnormal_exit', 'output_limit', 'spawn_failed', 'invalid_progress', 'incomplete'].includes(value.reason),
    [null, 'SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV'].includes(value.signal), validAt(value.at), validCg(value.cg),
    value.at !== null || value.cg !== null].every(Boolean)
}
function witness(line) {
  if (!line.startsWith(witnessPrefix) || line.length > 350) return null
  let value
  try { value = JSON.parse(line.slice(witnessPrefix.length)) } catch { return null }
  if (!validWitness(value)) return null
  return witnessPrefix + JSON.stringify({ reason: value.reason, signal: value.signal, at: value.at, cg: value.cg })
}

function projectLine(line) {
  const compiler = witness(line)
  if (compiler) return compiler
  const file = testFile(line)
  if (file) return file
  const summary = counters(line)
  if (summary) return summary
  const duration = line.match(/^Duration\s+(\d{1,9}(?:\.\d{1,3})?)(ms|s)\b/)
  if (duration) return `duration ${duration[1]}${duration[2]}`
  const runner = line.match(/^RUN\s+v(\d{1,3}\.\d{1,3}\.\d{1,3})\b/)
  return runner ? `test_runner version=${runner[1]}` : null
}

function safeTail(output) {
  const lines = String(output).slice(-8192).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g'), '')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const projected = lines.map(projectLine)
  return { output_tail: projected.filter(Boolean).slice(-12), output_omitted: projected.includes(null) }
}

// Diagnostics describe observed output only; they never establish success or cleanup.
export function packageTimeout(label, output = '') {
  const stage = stages.get(label) || 'command'
  const safeLabel = stages.has(label) ? label : 'Command'
  const error = new Error(`${safeLabel} exceeded the job deadline`)
  records.set(error, Object.freeze({ version: 1, stage, ...safeTail(output) }))
  return error
}

export function readTimeoutDiagnostics(error) {
  const result = records.get(error)
  return result ? { ...result, output_tail: [...result.output_tail] } : null
}

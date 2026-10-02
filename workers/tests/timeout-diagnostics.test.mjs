import test from 'node:test'
import assert from 'node:assert/strict'
import { createRunner } from '../process.mjs'
import { packageTimeout, readTimeoutDiagnostics } from '../timeout-diagnostics.mjs'

const output = '✓ tests/private-case.test.ts (4 tests) 25ms\nTests 4 passed (4)'

test('timeout keeps only finite safe progress and a fixed stage', () => {
  const secret = 'fixture-only-private-token'
  const diagnostic = readTimeoutDiagnostics(packageTimeout('Verification test',
    `${output}\nerror: Bearer ${secret} https://private.invalid/x\n at private/path:3\n${secret}`))
  assert.equal(diagnostic.stage, 'verification_test')
  assert.equal(diagnostic.output_omitted, true)
  assert.match(diagnostic.output_tail[0], /^test_file passed id=[a-f0-9]{16} tests=4 duration_ms=25$/)
  assert.equal(diagnostic.output_tail[1], 'tests passed=4')
  const text = JSON.stringify(diagnostic)
  for (const value of [secret, 'private-case', 'private.invalid', 'private/path', 'Bearer']) assert.ok(!text.includes(value))
})

test('every supported stage is fixed; arbitrary labels and logs never enter diagnostics', () => {
  for (const [label, stage] of [['Dependency setup', 'dependency_setup'], ['Browser setup', 'browser_setup'],
    ['Verification test:e2e', 'verification_test_e2e'], ['Repository fetch', 'repository_fetch']]) {
    assert.equal(readTimeoutDiagnostics(packageTimeout(label)).stage, stage)
  }
  const error = packageTimeout('private/label token=fixture-only-secret', 'arbitrary private text')
  assert.equal(error.message, 'Command exceeded the job deadline')
  assert.deepEqual(readTimeoutDiagnostics(error).output_tail, [])
})

test('projection has twelve-line and eight-KiB bounds, strips ANSI, and cannot be copied as evidence', () => {
  const error = packageTimeout('Verification test', `${String.fromCharCode(27)}[32m${output}\n${'Duration 1.25s\n'.repeat(30)}`)
  const result = readTimeoutDiagnostics(error)
  assert.equal(result.output_tail.length, 12)
  assert.ok(JSON.stringify(result).length < 3072)
  assert.equal(readTimeoutDiagnostics(JSON.parse(JSON.stringify(error))), null)
  assert.equal(readTimeoutDiagnostics(new Error(error.message)), null)
  result.output_tail.push('mutated')
  assert.equal(readTimeoutDiagnostics(error).output_tail.length, 12)
  assert.deepEqual(readTimeoutDiagnostics(packageTimeout('Verification test', output + 'x'.repeat(9000))).output_tail, [])
})

test('real timed-out native command retains output only after the original bounded close', async () => {
  const run = createRunner(Date.now() + 3000)
  const program = `console.log(${JSON.stringify(output)}); console.error('fixture-only-secret'); setInterval(() => {}, 1000)`
  await assert.rejects(run(process.execPath, ['-e', program], { label: 'Verification test', timeoutMs: 500 }), error => {
    assert.match(error.message, /exceeded the job deadline/)
    assert.equal(readTimeoutDiagnostics(error).stage, 'verification_test')
    assert.equal(readTimeoutDiagnostics(error).output_tail.length, 2)
    assert.equal(readTimeoutDiagnostics(error).output_omitted, true)
    return true
  })
})

test('deadline watchdog kill still saves the tail, ordinary stop remains an ordinary failure', async () => {
  const deadline = Date.now() + 700
  const run = createRunner(deadline)
  const pending = run(process.execPath, ['-e', `console.log(${JSON.stringify(output)}); setInterval(() => {}, 1000)`], { label: 'Verification test' })
  const watchdog = setTimeout(() => run.stop(), Math.max(1, deadline - Date.now()))
  try { await assert.rejects(pending, error => readTimeoutDiagnostics(error)?.stage === 'verification_test') }
  finally { clearTimeout(watchdog) }
  const ordinary = createRunner(Date.now() + 3000)
  const stopped = ordinary(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { label: 'Verification test' })
  const stop = setTimeout(() => ordinary.stop(), 100)
  try { await assert.rejects(stopped, error => readTimeoutDiagnostics(error) === null) }
  finally { clearTimeout(stop) }
})

test('closed compiler witness survives timeout; foreign keys, phases, strings and oversized lines are omitted', () => {
  const witness = { reason: 'abnormal_exit', signal: 'SIGKILL', at: [12, 'global_initial_entry', 0, null, 3000],
    cg: [2, 'local', 4294967296, 1000, 1200, 0, 1] }
  const line = value => 'error: TypeScript worker witness ' + JSON.stringify(value)
  const valid = readTimeoutDiagnostics(packageTimeout('Verification typecheck', line(witness)))
  assert.deepEqual(valid.output_tail, [line(witness)])
  const invalid = [{ ...witness, secret: 'fixture-only-secret' }, { ...witness, signal: 'private' },
    { ...witness, at: [12, 'fixture-only-secret', 0, null, 3000] }, { ...witness, cg: [2, 'private', 1, 1, 1, 1, 1] },
    { ...witness, at: [12, 'global', 0, 256, 3000] }, { ...witness, cg: [2, 'local', 'secret', 1, 1, 1, 1] },
    { ...witness, at: null, cg: null }, { ...witness, reason: 'x'.repeat(400) }]
  for (const value of invalid) {
    const result = readTimeoutDiagnostics(packageTimeout('Verification typecheck', line(value)))
    assert.deepEqual(result.output_tail, []); assert.equal(result.output_omitted, true)
    assert.ok(!JSON.stringify(result).includes('fixture-only-secret'))
  }
})

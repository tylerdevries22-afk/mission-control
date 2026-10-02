import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { executeJob } from '../polled.mjs'
import { createRunner } from '../process.mjs'
import { createStateWriter } from '../state.mjs'
import { workDeadline } from '../lifecycle.mjs'
import { fixture, job } from './helpers.mjs'

test('genuine isolated package timeout atomically saves terminal stage and safe tail without success', async () => {
  const script = `node -e "console.log('✓ tests/owned.test.ts (3 tests) 20ms'); console.error('fixture-only-secret'); setInterval(()=>{},1000)"`
  const source = await fixture({ test: script })
  const leaf = job({ base_sha: source.sha, checks: ['test'], timeout_seconds: 2 })
  const underlying = createRunner(workDeadline(leaf)); const calls = []
  const run = (command, args, options) => {
    calls.push({ command, args })
    const selected = command === 'git' && args.includes('fetch')
      ? ['fetch', '--depth', '1', source.origin, source.sha] : args
    return underlying(command, selected, options)
  }
  run.stop = underlying.stop
  const file = path.join(source.directory, 'worker-state.json')
  const result = await executeJob(leaf, { run, cwd: source.checkout, write: createStateWriter(file) })
  const saved = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(result.state, 'failed'); assert.equal(saved.state, 'failed')
  assert.equal(saved.result_sha, null); assert.equal(saved.resolution, null)
  assert.equal(saved.error_message, 'Verification test exceeded the job deadline')
  assert.equal(saved.timeout_diagnostics.stage, 'verification_test')
  assert.match(saved.timeout_diagnostics.output_tail[0], /tests=3 duration_ms=20$/)
  assert.equal(saved.timeout_diagnostics.output_omitted, true)
  assert.ok(!JSON.stringify(saved).includes('fixture-only-secret'))
  assert.equal((await stat(file)).mode & 0o777, 0o600)
  assert.ok(!calls.some(call => call.args.includes('push')))
})

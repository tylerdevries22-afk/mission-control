import test from 'node:test'
import assert from 'node:assert/strict'
import { packageFailure } from '../command-error.mjs'

test('dependency failure includes useful bounded diagnostics', () => {
  const error = packageFailure('Dependency setup', 1, 'progress\ngyp ERR! find Python Python is not set', {})
  assert.match(error.message, /find Python/)
  assert.ok(packageFailure('Dependency setup', 1, 'error: ' + 'x'.repeat(10000), {}).message.length < 450)
})
test('Vitest failure summaries survive ANSI styling and retain the failed test', () => {
  const output = '\u001b[31m FAIL  \u001b[0m workers/tests/sample.test.mjs > rejects invalid input\n  AssertionError: expected invalid input to be rejected'
  const error = packageFailure('Verification test', 1, output, {})
  assert.match(error.message, /FAIL\s+workers\/tests\/sample\.test\.mjs/)
  assert.match(error.message, /AssertionError/)
})
test('assertion diagnostics keep secret, token, and URL redaction and stay bounded', () => {
  const output = 'AssertionError: private-value-123 Bearer hidden https://secret@example.com/path token=abcdefghi ' + 'x'.repeat(10000)
  const error = packageFailure('Verification test', 1, output, { API_KEY: 'private-value-123' })
  for (const secret of ['private-value-123', 'hidden', 'secret@example', 'abcdefghi']) assert.ok(!error.message.includes(secret))
  assert.match(error.message, /AssertionError/)
  assert.ok(error.message.length < 450)
})
test('unrecognized verification output falls back to the safe summary', () => {
  assert.equal(packageFailure('Verification test', 1, 'Tests aborted\n0 failures', {}).message,
    'Verification test failed (exit 1)')
})
test('package diagnostics redact credentials and URLs', () => {
  const error = packageFailure('Browser setup', 1, 'error: private-value-123 Bearer hidden https://secret@example.com/path token=abcdefghi', { API_KEY: 'private-value-123' })
  for (const secret of ['private-value-123', 'hidden', 'secret@example', 'abcdefghi']) assert.ok(!error.message.includes(secret))
})
test('LLM and other command output remains excluded from errors', () => {
  assert.equal(packageFailure('Claude worker', 1, 'error: private transcript', {}).message, 'Claude worker failed (exit 1)')
})

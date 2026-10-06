// @vitest-environment node
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const cli = fileURLToPath(new URL('../../../scripts/mc-cli.cjs', import.meta.url))
const homes: string[] = []
const servers: Server[] = []
const cookie = `mc-session=${'a'.repeat(64)}`
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise<void>(resolve => server.close(() => resolve()))
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})
async function fixture() {
  const home = mkdtempSync(path.join(tmpdir(), 'mc-cli-auth-test-')); homes.push(home)
  const bodies: unknown[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      bodies.push(JSON.parse(body))
      response.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `${cookie}; Path=/; HttpOnly` })
      response.end(JSON.stringify({ user: { username: 'admin' } }))
    })
  }); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a test-only socket')
  const url = `http://127.0.0.1:${address.port}`
  async function run(flags: string[], password: string) {
    return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'auth', 'login', '--username', 'admin',
        '--url', url, '--json', ...flags], { env: { PATH: process.env.PATH, HOME: home }, timeout: 5000 })
      let stdout = ''; let stderr = ''
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
      child.once('error', reject)
      child.stdin.on('error', error => {
        if ((error as NodeJS.ErrnoException).code !== 'EPIPE') reject(error)
      })
      child.once('close', code => resolve({ code, stdout, stderr }))
      child.stdin.end(password)
    })
  }
  return { home, bodies, run }
}

describe('CLI password input compatibility', () => {
  it('uses stdin, privately saves the session and redacts its JSON response', async () => {
    const f = await fixture()
    const result = await f.run(['--password-stdin'], 'test-only-password\n')
    expect(result.code).toBe(0)
    expect(f.bodies).toEqual([{ username: 'admin', password: 'test-only-password' }])
    expect(result.stdout).not.toContain(cookie)
    expect(result.stdout).not.toContain('test-only-password')
    expect(JSON.parse(result.stdout).data.saved_cookie).toBe(true)
    const profile = path.join(f.home, '.mission-control/profiles/default.json')
    expect(statSync(profile).mode & 0o777).toBe(0o600)
    expect(JSON.parse(readFileSync(profile, 'utf8')).cookie).toBe(cookie)
  })
  it.each([{ label: 'empty', password: '' }, { label: 'oversized', password: 'x'.repeat(65537) }])('rejects $label stdin before a request', async ({ password }) => {
    const f = await fixture()
    expect((await f.run(['--password-stdin'], password)).code).toBe(2)
    expect(f.bodies).toEqual([])
  })
  it('rejects conflicting password inputs before a request', async () => {
    const f = await fixture()
    expect((await f.run(['--password-stdin', '--password', 'test-only'], 'test-only')).code).toBe(2)
    expect(f.bodies).toEqual([])
  })
  it('keeps legacy argv input compatible with a warning', async () => {
    const f = await fixture()
    const result = await f.run(['--password', 'test-only'], '')
    expect(result.code).toBe(0)
    expect(result.stderr).toContain('visible in process arguments')
    expect(result.stdout).not.toContain(cookie)
  })
})

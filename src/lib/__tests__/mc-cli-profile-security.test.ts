// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, readdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

interface Profile { name: string; url: string; apiKey: string; cookie: string }
const require = createRequire(import.meta.url)
const { profilePath, loadProfile, saveProfile } = require('../../../scripts/mc-cli-profile.cjs') as {
  profilePath: (name: string, home?: string) => string
  loadProfile: (name: string, home?: string, env?: Record<string, string>) => Profile
  saveProfile: (profile: Profile, home?: string, backup?: boolean) => void
}
const homes: string[] = []
const fresh = () => { const home = mkdtempSync(path.join(tmpdir(), 'mc-cli-test-')); homes.push(home); return home }
const sample: Profile = { name: 'default', url: 'http://127.0.0.1:4000', apiKey: '', cookie: 'test-only' }
afterEach(() => { for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }) })

describe('private CLI profile storage', () => {
  it.each(['../escape', 'a/b', '', '.', 'x'.repeat(65)])('rejects unsafe profile name %s', name => {
    expect(() => profilePath(name, fresh())).toThrow('Invalid profile name')
  })
  it('creates private directories and an atomic mode-600 profile even with permissive umask', () => {
    const home = fresh()
    const previous = process.umask(0)
    try { saveProfile(sample, home) } finally { process.umask(previous) }
    const file = profilePath('default', home)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700)
    expect(statSync(path.dirname(path.dirname(file))).mode & 0o777).toBe(0o700)
    expect(loadProfile('default', home, {})).toEqual(sample)
    expect(readdirSync(path.dirname(file))).toEqual(['default.json'])
  })
  it('keeps a private backup of a prior profile when explicitly requested', () => {
    const home = fresh()
    saveProfile(sample, home)
    saveProfile({ ...sample, cookie: 'replacement' }, home, true)
    const directory = path.dirname(profilePath('default', home))
    const backup = readdirSync(directory).find(name => name.includes('.before-login-'))
    expect(backup).toBeDefined()
    if (!backup) throw new Error('Expected a private backup')
    expect(JSON.parse(readFileSync(path.join(directory, backup), 'utf8'))).toEqual(sample)
    expect(statSync(path.join(directory, backup)).mode & 0o777).toBe(0o600)
    expect(loadProfile('default', home, {}).cookie).toBe('replacement')
  })
  it('refuses a symlinked profile without changing its target', () => {
    const home = fresh()
    const file = profilePath('default', home)
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const target = path.join(home, 'untouched.json')
    writeFileSync(target, 'keep me')
    symlinkSync(target, file)
    expect(() => saveProfile(sample, home)).toThrow('without symlinks')
    expect(() => loadProfile('default', home, {})).toThrow('safely')
    expect(readFileSync(target, 'utf8')).toBe('keep me')
  })
  it('refuses a symlinked parent directory', () => {
    const home = fresh()
    const target = path.join(home, 'other')
    mkdirSync(target)
    symlinkSync(target, path.join(home, '.mission-control'))
    expect(() => saveProfile(sample, home)).toThrow('without symlinks')
    expect(() => loadProfile('default', home, {})).toThrow('without symlinks')
    expect(readdirSync(target)).toEqual([])
  })
  it.each(['{', 'null', '[]', '{"cookie":123}', 'x'.repeat(65537)])('fails closed on corrupt profiles', content => {
    const home = fresh()
    const file = profilePath('default', home)
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    writeFileSync(file, content, { mode: 0o600 })
    expect(() => loadProfile('default', home, { MC_COOKIE: 'fallback' })).toThrow('safely')
  })
  it('tightens existing directory permissions on save', () => {
    const home = fresh()
    saveProfile(sample, home)
    const directory = path.dirname(profilePath('default', home))
    chmodSync(directory, 0o755)
    saveProfile(sample, home)
    expect(statSync(directory).mode & 0o777).toBe(0o700)
  })
  it('rejects an existing credential file readable by other users', () => {
    const home = fresh()
    saveProfile(sample, home)
    chmodSync(profilePath('default', home), 0o644)
    expect(() => loadProfile('default', home, {})).toThrow('safely')
  })
  it('rejects a parent directory accessible to other users on read', () => {
    const home = fresh()
    saveProfile(sample, home)
    chmodSync(path.dirname(profilePath('default', home)), 0o755)
    expect(() => loadProfile('default', home, {})).toThrow('private')
  })
  it('uses explicit environment defaults when no profile exists', () => {
    expect(loadProfile('default', fresh(), { MC_URL: sample.url })).toEqual({ ...sample, cookie: '' })
  })
})

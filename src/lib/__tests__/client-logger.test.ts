import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('client logger', () => {
  it.each(['debug', 'info', 'warn', 'error'] as const)('bounds %s text to one log record', async level => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    const output = vi.spyOn(console, level).mockImplementation(() => {})
    const { createClientLogger } = await import('../client-logger')
    createClientLogger('module\r\nforged')[level]('message\nforged', 'detail\rforged')
    expect(output).toHaveBeenCalledWith(`[${level.toUpperCase()}] module  forged: message forged detail forged`)
  })

  it('preserves structured fields and sanitizes the accompanying message', async () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createClientLogger } = await import('../client-logger')
    const context = { status: 503, operation: 'gateway' }
    createClientLogger('gateway').warn(context, 'retry\r\nlater')
    expect(output).toHaveBeenCalledWith(`[WARN] gateway: ${JSON.stringify(context)} retry  later`)
    const rendered = String(output.mock.calls[0][0]).slice('[WARN] gateway: '.length).split(' retry')[0]
    expect(JSON.parse(rendered)).toEqual(context)
  })

  it('redacts credential fields in structured context without modifying input', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createClientLogger } = await import('../client-logger')
    const context = { status: 403, token: 'private-token', nested: { password: 'private-password' } }
    createClientLogger('gateway').error(context, 'denied')
    const rendered = String(output.mock.calls[0][0]).slice('[ERROR] gateway: '.length).replace(/ denied$/, '')
    expect(JSON.parse(rendered)).toEqual({ status: 403, token: '[redacted]', nested: { password: '[redacted]' } })
    expect(context.token).toBe('private-token')
    expect(context.nested.password).toBe('private-password')
  })

  it('bounds error and circular context without exposing raw objects', async () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createClientLogger } = await import('../client-logger')
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    createClientLogger('gateway').warn(new Error('line\nforged'))
    const rendered = String(output.mock.calls[0][0]).slice('[WARN] gateway: '.length)
    expect(rendered).not.toMatch(/[\r\n]/)
    expect(JSON.parse(rendered).message).toBe('line\nforged')
    createClientLogger('gateway').warn(cycle)
    expect(output.mock.calls[1][0]).toBe('[WARN] gateway: [unserializable context]')
  })

  it('suppresses production debug and info while keeping warnings and errors', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const outputs = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    }
    const { createClientLogger } = await import('../client-logger')
    const logger = createClientLogger('gateway')
    for (const level of ['debug', 'info', 'warn', 'error'] as const) logger[level]('message')
    expect(outputs.debug).not.toHaveBeenCalled()
    expect(outputs.info).not.toHaveBeenCalled()
    expect(outputs.warn).toHaveBeenCalledOnce()
    expect(outputs.error).toHaveBeenCalledOnce()
  })
})

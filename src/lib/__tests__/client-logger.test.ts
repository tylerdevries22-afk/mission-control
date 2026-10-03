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
    expect(output).toHaveBeenCalledWith(`[${level.toUpperCase()}] module  forged:`, 'message forged', 'detail forged')
  })

  it('preserves structured fields and sanitizes the accompanying message', async () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { createClientLogger } = await import('../client-logger')
    const context = { status: 503, operation: 'gateway' }
    createClientLogger('gateway').warn(context, 'retry\r\nlater')
    expect(output).toHaveBeenCalledWith('[WARN] gateway:', context, 'retry  later')
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

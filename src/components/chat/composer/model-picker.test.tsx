import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { ModelPicker } from './model-picker'
import en from '../../../../messages/en.json'

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>
  )
}

describe('ModelPicker', () => {
  it('marks the active catalog model', () => {
    const onChange = vi.fn()
    render(wrap(
      <ModelPicker value="opus" onChange={onChange} fastMode={false} onFastMode={() => undefined} onClose={() => undefined} />,
    ))
    expect(screen.getByText('Opus 4.6')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Sonnet 4.6'))
    expect(onChange).toHaveBeenCalledWith('sonnet')
  })
})

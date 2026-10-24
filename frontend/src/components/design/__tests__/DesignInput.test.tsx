import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DesignInput } from '@/components/design/DesignInput'

describe('DesignInput', () => {
  it('marks an empty field and a filled field', () => {
    const { rerender } = render(<DesignInput aria-label="Amount" placeholder="0" />)
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="design-input"]')).toHaveAttribute('data-status', 'empty')

    rerender(<DesignInput aria-label="Amount" value="1.5" onChange={() => undefined} />)
    expect(document.querySelector('[data-slot="design-input"]')).toHaveAttribute('data-status', 'filled')
  })

  it('hides the trailing icon when disabled or readonly and keeps the leading icon', () => {
    const { rerender } = render(
      <DesignInput
        aria-label="Address"
        leadingIcon={<span data-testid="leading" />}
        trailingIcon={<span data-testid="trailing" />}
        disabled
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Address' })).toBeDisabled()
    expect(screen.getByTestId('leading')).toBeInTheDocument()
    expect(screen.queryByTestId('trailing')).not.toBeInTheDocument()

    rerender(
      <DesignInput
        aria-label="Address"
        leadingIcon={<span data-testid="leading" />}
        trailingIcon={<span data-testid="trailing" />}
        readOnly
        value="bc1qexample"
        onChange={() => undefined}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveAttribute('readonly')
    expect(screen.getByTestId('leading')).toBeInTheDocument()
    expect(screen.queryByTestId('trailing')).not.toBeInTheDocument()
  })

  it('shows the trailing icon on an editable field', () => {
    render(
      <DesignInput
        aria-label="Label"
        trailingIcon={<span data-testid="trailing" />}
      />,
    )
    expect(screen.getByTestId('trailing')).toBeInTheDocument()
  })
})

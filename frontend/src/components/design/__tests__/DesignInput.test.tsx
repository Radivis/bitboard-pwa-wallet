import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Search } from 'lucide-react'
import { DesignInput } from '@/components/design/DesignInput'

function icon(name: string) {
  return document.querySelector(`.lucide-${name}`)
}

describe('DesignInput', () => {
  it('marks an empty field and a filled field', () => {
    const { rerender } = render(
      <DesignInput aria-label="Amount" placeholder="0" value="" onChange={() => undefined} />,
    )
    expect(screen.getByRole('textbox', { name: 'Amount' })).toBeInTheDocument()
    expect(document.querySelector('[data-slot="design-input"]')).toHaveAttribute('data-status', 'empty')

    rerender(<DesignInput aria-label="Amount" value="1.5" onChange={() => undefined} />)
    expect(document.querySelector('[data-slot="design-input"]')).toHaveAttribute('data-status', 'filled')
  })

  it('shows a placeholder-colored square pen beside the placeholder on an enabled empty field', () => {
    render(
      <DesignInput aria-label="Amount" placeholder="0" leadingIcon={Search} />,
    )

    const field = screen.getByRole('textbox', { name: 'Amount' })
    expect(field).toHaveAttribute('placeholder', '0')
    expect(field.className).toContain('placeholder:text-transparent')
    expect(screen.getByText('0')).toBeInTheDocument()

    const pen = icon('square-pen')
    expect(pen).toBeInTheDocument()
    expect(pen?.parentElement).toHaveClass('text-[var(--design-input-placeholder)]')
    expect(pen?.closest('[aria-hidden="true"]')).toBeTruthy()
    expect(icon('search')).toHaveClass('text-[var(--design-input-content)]')
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('hides the browser clear icon on a search field', () => {
    render(
      <DesignInput
        aria-label="Search"
        type="search"
        value="fsfd"
        onChange={() => undefined}
      />,
    )
    expect(screen.getByRole('searchbox', { name: 'Search' }).className).toContain(
      '[&::-webkit-search-cancel-button]:hidden',
    )
  })

  it('keeps the value at least 48px wide', () => {
    render(
      <DesignInput aria-label="Count" value="1" onChange={() => undefined} className="w-24" />,
    )
    expect(screen.getByRole('textbox', { name: 'Count' }).parentElement).toHaveClass('min-w-12')
  })

  it('omits the square pen when the field has no placeholder', () => {
    render(<DesignInput aria-label="Amount" leadingIcon={Search} />)
    expect(icon('square-pen')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('shows the brush on a filled enabled field and clears a controlled value', async () => {
    const user = userEvent.setup()

    function Field() {
      const [value, setValue] = useState('1.5')
      return (
        <DesignInput
          aria-label="Amount"
          placeholder="0"
          leadingIcon={Search}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    }

    render(<Field />)
    expect(icon('square-pen')).not.toBeInTheDocument()
    expect(icon('brush-cleaning')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveClass(
      'text-[var(--design-input-content)]',
    )

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('')
    expect(icon('square-pen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('clears without blurring the field first', async () => {
    const user = userEvent.setup()
    const blurredValues: string[] = []

    function Field() {
      const [value, setValue] = useState('12')
      return (
        <DesignInput
          aria-label="Interval"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={(event) => blurredValues.push(event.currentTarget.value)}
        />
      )
    }

    render(<Field />)
    const input = screen.getByRole('textbox', { name: 'Interval' })
    input.focus()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(input).toHaveValue('')
    expect(blurredValues).toEqual([])
  })

  it('shows the brush after typing into an uncontrolled field and clears it', async () => {
    const user = userEvent.setup()
    render(<DesignInput aria-label="Note" placeholder="Type" defaultValue="hello" />)

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('')
    expect(icon('square-pen')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'hi')
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
    expect(icon('square-pen')).not.toBeInTheDocument()
  })

  it('hides the pen and brush when disabled or readonly and keeps the leading icon', () => {
    const { rerender } = render(
      <DesignInput
        aria-label="Address"
        leadingIcon={Search}
        placeholder="bc1…"
        disabled
        value=""
        onChange={() => undefined}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Address' })).toBeDisabled()
    expect(icon('search')).toHaveClass('text-[var(--design-input-placeholder)]')
    expect(icon('square-pen')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()

    rerender(
      <DesignInput
        aria-label="Address"
        leadingIcon={Search}
        placeholder="bc1…"
        readOnly
        value="bc1qexample"
        onChange={() => undefined}
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveAttribute('readonly')
    expect(icon('search')).toHaveClass('text-[var(--design-input-content)]')
    expect(icon('square-pen')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('restores resetTo and calls onReset', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()

    function Field() {
      const [value, setValue] = useState('https://custom')
      return (
        <DesignInput
          aria-label="Endpoint URL"
          value={value}
          resetTo="https://default"
          onReset={onReset}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    }

    render(<Field />)
    const resetButton = screen.getByRole('button', { name: 'Reset to default' })
    expect(resetButton).toBeEnabled()
    expect(resetButton).toHaveAttribute('data-type', 'tertiary')

    await user.click(resetButton)
    expect(screen.getByRole('textbox', { name: 'Endpoint URL' })).toHaveValue('https://default')
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()
  })

  it('disables reset when the value already matches, or the field is disabled or readonly', () => {
    const { rerender } = render(
      <DesignInput
        aria-label="Endpoint URL"
        value="https://default"
        resetTo="https://default"
        onChange={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()

    rerender(
      <DesignInput
        aria-label="Endpoint URL"
        value="https://custom"
        resetTo="https://default"
        onChange={() => undefined}
        disabled
      />,
    )
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()

    rerender(
      <DesignInput
        aria-label="Endpoint URL"
        value="https://custom"
        resetTo="https://default"
        onChange={() => undefined}
        readOnly
      />,
    )
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('shows reset when only onReset is provided', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(
      <DesignInput
        aria-label="Endpoint URL"
        value="https://custom"
        onChange={() => undefined}
        onReset={onReset}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Endpoint URL' })).toHaveValue('https://custom')
  })
})

import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignCheckbox } from '@/components/design/DesignCheckbox'

function ControlledCheckbox({
  onChange,
}: {
  onChange: (checked: boolean) => void
}) {
  const [checked, setChecked] = useState(false)
  return (
    <>
      <DesignCheckbox
        id="ack"
        checked={checked}
        onChange={(event) => {
          setChecked(event.target.checked)
          onChange(event.target.checked)
        }}
      />
      <label htmlFor="ack">I understand</label>
    </>
  )
}

describe('DesignCheckbox', () => {
  it('associates the label and reports checked changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ControlledCheckbox onChange={onChange} />)

    const checkbox = screen.getByRole('checkbox', { name: 'I understand' })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(checkbox).toBeChecked()
  })

  it('fades the box color and the check icon', () => {
    render(<DesignCheckbox aria-label="Ready" defaultChecked />)

    const checkbox = screen.getByRole('checkbox', { name: 'Ready' })
    const box = checkbox.nextElementSibling
    const icon = box?.nextElementSibling
    expect(checkbox).toBeChecked()
    expect(box).toHaveClass(
      'duration-200',
      'ease-out',
      'border-[var(--design-accent-secondary-stroke)]',
      'peer-checked:bg-[var(--design-accent-primary)]',
    )
    expect(icon).toHaveClass(
      'duration-200',
      'ease-out',
      'opacity-0',
      'peer-checked:opacity-100',
      'text-[var(--design-text-button)]',
    )
  })

  it('can be disabled', () => {
    render(<DesignCheckbox aria-label="Ready" disabled />)
    expect(screen.getByRole('checkbox', { name: 'Ready' })).toBeDisabled()
  })
})

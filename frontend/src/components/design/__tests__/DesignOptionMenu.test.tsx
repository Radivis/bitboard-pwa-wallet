import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DesignOptionMenu } from '@/components/design/DesignOptionMenu'

const OPTIONS = [
  { value: '1', label: '1 Beginner' },
  { value: '2', label: '2 Intermediate' },
  { value: '3', label: '3 Advanced' },
  { value: '4', label: '4 Expert' },
  { value: '5', label: '5 Specialist' },
] as const

function tabIndexes(): string[] {
  return screen.getAllByRole('option').map((option) => option.getAttribute('tabindex') ?? '')
}

describe('DesignOptionMenu', () => {
  it('moves one tab stop with Arrow, Home, and End, and selects on Enter', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <DesignOptionMenu
        ariaLabel="Minimum level"
        value="2"
        options={OPTIONS}
        onValueChange={onValueChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Minimum level 2 Intermediate' }))

    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveFocus()
    expect(tabIndexes()).toEqual(['-1', '0', '-1', '-1', '-1'])

    await user.keyboard('{ArrowDown}')
    expect(options[2]).toHaveFocus()
    expect(tabIndexes()).toEqual(['-1', '-1', '0', '-1', '-1'])
    expect(onValueChange).not.toHaveBeenCalled()

    await user.keyboard('{ArrowDown}')
    await user.keyboard('{End}')
    expect(options[4]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(options[4]).toHaveFocus()

    await user.keyboard('{Home}')
    expect(options[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(options[0]).toHaveFocus()
    expect(tabIndexes().filter((tabIndex) => tabIndex === '0')).toHaveLength(1)

    await user.keyboard('{Enter}')
    expect(onValueChange).toHaveBeenCalledWith('1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
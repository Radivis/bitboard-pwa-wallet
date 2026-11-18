import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DesignPagination } from '@/components/design/DesignPagination'

function renderPagination(page: number, totalPages = 5) {
  const onPageChange = vi.fn()
  render(
    <DesignPagination page={page} totalPages={totalPages} onPageChange={onPageChange} />,
  )
  return { onPageChange }
}

describe('DesignPagination', () => {
  it('labels the current page and keeps every step control available', () => {
    renderPagination(2)

    expect(screen.getByRole('button', { name: 'Page 2/5' })).toHaveTextContent('2/5')
    expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeEnabled()
  })

  it('disables the previous cluster on the first page', () => {
    renderPagination(1)

    const firstPage = screen.getByRole('button', { name: 'First page' })
    const previousPage = screen.getByRole('button', { name: 'Previous page' })
    expect(firstPage).toBeDisabled()
    expect(previousPage).toBeDisabled()
    expect(firstPage.className).toContain('disabled:opacity-50')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeEnabled()
  })

  it('disables the next cluster on the last page', () => {
    renderPagination(5)

    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled()
  })

  it('keeps the closed trigger on the nav-button background', () => {
    renderPagination(2)

    const trigger = screen.getByRole('button', { name: 'Page 2/5' })
    expect(trigger.className).toContain('bg-[var(--design-nav-background)]')
    expect(trigger.className).toContain('hover:bg-[var(--design-nav-background-hover)]')
    expect(trigger.className).not.toContain('--design-nav-background-active')
    expect(trigger.className).not.toContain('--design-elevation-1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens a nav-button menu and selects a page', async () => {
    const user = userEvent.setup()
    const { onPageChange } = renderPagination(2)

    await user.click(screen.getByRole('button', { name: 'Page 2/5' }))

    const trigger = screen.getByRole('button', { name: 'Page 2/5' })
    expect(trigger.className).toContain('bg-[var(--design-nav-background-active)]')
    expect(trigger.className).toContain('ring-[var(--design-accent-primary-active)]')
    expect(trigger.className).not.toContain('--design-elevation-1')

    const menu = screen.getByRole('listbox', { name: 'Page' })
    expect(menu.parentElement?.className).toContain('bg-[var(--design-elevation-drawer)]')
    expect(menu.parentElement?.className).toContain('backdrop-blur-[5px]')
    expect(menu.parentElement?.className).not.toContain('--design-nav-background')
    expect(menu.className).toContain('p-1')

    const currentPage = screen.getByRole('option', { name: '2/5' })
    const otherPage = screen.getByRole('option', { name: '4/5' })
    expect(currentPage).toHaveAttribute('aria-selected', 'true')
    expect(currentPage.className).toContain('bg-[var(--design-nav-background-active)]')
    expect(currentPage.className).toContain('ring-[var(--design-accent-primary-active)]')
    expect(otherPage.className).toContain('bg-[var(--design-nav-background)]')
    expect(otherPage.className).toContain('hover:bg-[var(--design-nav-background-hover)]')
    expect(otherPage.className).not.toContain('--design-elevation-1')

    await user.click(otherPage)

    expect(onPageChange).toHaveBeenCalledWith(4)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes the menu when escape is pressed', async () => {
    const user = userEvent.setup()
    renderPagination(2)

    await user.click(screen.getByRole('button', { name: 'Page 2/5' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

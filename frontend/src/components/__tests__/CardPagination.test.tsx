import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test-utils/test-providers'
import { CardPagination } from '@/components/CardPagination'

describe('CardPagination', () => {
  it('renders children without navigator when totalCount <= pageSize', () => {
    renderWithProviders(
      <CardPagination totalCount={5} pageSize={20} pageIndex={0} onPageChange={vi.fn()}>
        <div>Page content</div>
      </CardPagination>,
    )
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'First page' })).not.toBeInTheDocument()
  })

  it('shows pagination controls when totalCount exceeds pageSize', () => {
    renderWithProviders(
      <CardPagination totalCount={25} pageSize={20} pageIndex={0} onPageChange={vi.fn()}>
        <div>Page content</div>
      </CardPagination>,
    )
    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeInTheDocument()
  })
})

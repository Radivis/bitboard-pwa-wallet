import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LibraryFilterSort } from '@/components/library/LibraryFilterSort'
import { renderWithLibraryRouter } from '@/test-utils/library-router'
import { useLibraryFilterSortStore } from '@/stores/libraryFilterSortStore'

describe('LibraryFilterSort', () => {
  beforeEach(() => {
    useLibraryFilterSortStore.setState({
      query: '',
      minimumLevel: 1,
      maximumLevel: 5,
      sort: 'title-asc',
      scope: 'all',
    })
  })

  it('writes the search and the three dropdowns to the store', async () => {
    const user = userEvent.setup()
    renderWithLibraryRouter(<LibraryFilterSort />)

    await user.type(await screen.findByLabelText('Search'), 'ark')
    await user.selectOptions(screen.getByLabelText('Minimum level'), '3')
    await user.selectOptions(screen.getByLabelText('Maximum level'), '4')
    await user.selectOptions(screen.getByLabelText('Sort'), 'level-desc')

    expect(useLibraryFilterSortStore.getState()).toMatchObject({
      query: 'ark',
      minimumLevel: 3,
      maximumLevel: 4,
      sort: 'level-desc',
    })
    expect(screen.getByLabelText('Minimum level').className).toContain('appearance-none')
    expect(screen.getByLabelText('Minimum level').nextElementSibling).toHaveClass('right-4')
  })

  it('writes All and Favorites to the store', async () => {
    const user = userEvent.setup()
    renderWithLibraryRouter(<LibraryFilterSort />)

    await user.click(await screen.findByRole('button', { name: 'Favorites' }))
    expect(useLibraryFilterSortStore.getState().scope).toBe('favorites')

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(useLibraryFilterSortStore.getState().scope).toBe('all')
  })
})

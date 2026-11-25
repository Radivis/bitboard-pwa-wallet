import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  handleLibraryCatalogClick,
  libraryArticleHref,
  libraryTagHref,
  type LibraryCatalogClickActions,
} from '@/lib/library/library-catalog-click'

function renderCatalog(actions: LibraryCatalogClickActions) {
  return render(
    <div onClick={(event) => handleLibraryCatalogClick(event, actions)}>
      <a href={libraryArticleHref('what-is-a-wallet')} data-library-article="what-is-a-wallet">
        What is a wallet
      </a>
      <a href={libraryTagHref('bitcoin')} data-library-tag="bitcoin">
        Bitcoin
      </a>
      <a href="/library/articles/missing" data-library-article="missing-article">
        Missing
      </a>
      <button type="button" data-library-bookmark="what-is-a-wallet">
        <span>Bookmark</span>
      </button>
    </div>,
  )
}

function catalogActions(): LibraryCatalogClickActions {
  return {
    bookmarkSlugs: new Set(['what-is-a-wallet']),
    toggleBookmark: vi.fn(),
    navigateToArticle: vi.fn(),
    navigateToTag: vi.fn(),
  }
}

describe('handleLibraryCatalogClick', () => {
  it('saves a bookmark from a nested target and leaves navigation alone', async () => {
    const user = userEvent.setup()
    const actions = catalogActions()
    renderCatalog(actions)

    await user.click(screen.getByText('Bookmark'))

    expect(actions.toggleBookmark).toHaveBeenCalledWith('what-is-a-wallet', false)
    expect(actions.navigateToArticle).not.toHaveBeenCalled()
    expect(actions.navigateToTag).not.toHaveBeenCalled()
  })

  it('opens a tag without opening the article', async () => {
    const user = userEvent.setup()
    const actions = catalogActions()
    renderCatalog(actions)

    await user.click(screen.getByRole('link', { name: 'Bitcoin' }))

    expect(actions.navigateToTag).toHaveBeenCalledWith('bitcoin')
    expect(actions.navigateToArticle).not.toHaveBeenCalled()
  })

  it('opens an article from the title', async () => {
    const user = userEvent.setup()
    const actions = catalogActions()
    renderCatalog(actions)

    await user.click(screen.getByRole('link', { name: 'What is a wallet' }))

    expect(actions.navigateToArticle).toHaveBeenCalledWith('what-is-a-wallet')
  })

  it('leaves modified and non-primary clicks to the browser', () => {
    const actions = catalogActions()
    renderCatalog(actions)
    const title = screen.getByRole('link', { name: 'What is a wallet' })

    fireEvent.click(title, { ctrlKey: true })
    fireEvent.click(title, { metaKey: true })
    fireEvent.click(title, { shiftKey: true })
    fireEvent.click(title, { altKey: true })
    fireEvent.click(title, { button: 1 })

    expect(actions.navigateToArticle).not.toHaveBeenCalled()
  })

  it('ignores an article slug that is not in the catalog', async () => {
    const user = userEvent.setup()
    const actions = catalogActions()
    renderCatalog(actions)

    await user.click(screen.getByRole('link', { name: 'Missing' }))

    expect(actions.navigateToArticle).not.toHaveBeenCalled()
  })
})

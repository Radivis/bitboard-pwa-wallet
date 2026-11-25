import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'

import { LibraryIndexPage } from '@/pages/library/LibraryIndexPage'
import { isLibraryTagId, type LibraryTagId } from '@/lib/library/tags'
import { useLibraryFilterSortStore } from '@/stores/libraryFilterSortStore'

const setBookmark = vi.hoisted(() => vi.fn())

vi.mock('@/db', () => ({
  useLibraryBookmarks: () => ({ data: new Set<string>(), isLoading: false }),
  usePendingBookmarkSlugs: () => new Set<string>(),
  useSetArticleBookmark: () => ({
    mutateAsync: setBookmark,
    isPending: false,
    variables: undefined,
  }),
}))

function renderLibraryIndex() {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library',
    component: LibraryIndexPage,
  })
  const articleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/articles/$slug',
    component: () => <div>Article</div>,
  })
  const tagsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/tags',
    validateSearch: (search: Record<string, unknown>): { tag?: LibraryTagId } => {
      const tagFromSearch = search.tag
      if (typeof tagFromSearch !== 'string' || !isLibraryTagId(tagFromSearch)) return {}
      return { tag: tagFromSearch }
    },
    component: () => <div>Tags</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, articleRoute, tagsRoute]),
    history: createMemoryHistory({ initialEntries: ['/library'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('LibraryIndexPage catalog clicks', () => {
  beforeEach(() => {
    setBookmark.mockReset()
    useLibraryFilterSortStore.setState({
      query: '',
      minimumLevel: 1,
      maximumLevel: 5,
      sort: 'title-asc',
      scope: 'all',
    })
  })

  it('saves a bookmark from a card and stays on the index', async () => {
    const user = userEvent.setup()
    const router = renderLibraryIndex()

    await user.click(await screen.findByRole('button', { name: 'Add What is a wallet to bookmarks' }))

    expect(setBookmark).toHaveBeenCalledWith({
      articleSlug: 'what-is-a-wallet',
      isBookmarked: true,
    })
    expect(router.state.location.pathname).toBe('/library')
  })

  it('opens an article from its title', async () => {
    const user = userEvent.setup()
    const router = renderLibraryIndex()

    await user.click(await screen.findByRole('link', { name: 'What is a wallet' }))

    expect(router.state.location.pathname).toBe('/library/articles/what-is-a-wallet')
  })

  it('opens a tag from a card without opening the article', async () => {
    const user = userEvent.setup()
    const router = renderLibraryIndex()

    const card = (await screen.findByRole('link', { name: 'What is a wallet' })).closest('article')
    if (card == null) throw new Error('Library card for What is a wallet was not rendered')
    await user.click(within(card).getByRole('link', { name: 'Wallets' }))

    expect(router.state.location.pathname).toBe('/library/tags')
    expect(router.state.location.search).toEqual({ tag: 'wallets' })
  })
})

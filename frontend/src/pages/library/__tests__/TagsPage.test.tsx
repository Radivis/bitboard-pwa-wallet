import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'

import { TagsPage } from '@/pages/library/TagsPage'
import { isLibraryTagId, type LibraryTagId } from '@/lib/library/tags'
import { useLibraryFilterSortStore } from '@/stores/libraryFilterSortStore'

vi.mock('@/db', () => ({
  useLibraryBookmarks: () => ({ data: new Set<string>(), isLoading: false }),
  useSetArticleBookmark: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
  usePendingBookmarkSlugs: () => new Set<string>(),
}))

function renderTagsPage(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet })
  const tagsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/tags',
    validateSearch: (search: Record<string, unknown>): { tag?: LibraryTagId } => {
      const tagFromSearch = search.tag
      if (typeof tagFromSearch !== 'string' || !isLibraryTagId(tagFromSearch)) return {}
      return { tag: tagFromSearch }
    },
    component: TagsPage,
  })
  const articleRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/library/articles/$slug',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([tagsRoute, articleRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return render(<RouterProvider router={router} />)
}

function tagSection(tagId: string) {
  return document.getElementById(`library-tag-${tagId}`)
}

describe('TagsPage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    useLibraryFilterSortStore.setState({
      query: '',
      minimumLevel: 1,
      maximumLevel: 5,
      sort: 'title-asc',
      scope: 'all',
    })
  })

  it('hides a tag whose articles are all outside the level range', async () => {
    useLibraryFilterSortStore.setState({ minimumLevel: 5, maximumLevel: 5 })
    renderTagsPage('/library/tags')

    await waitFor(() => {
      expect(tagSection('elliptic-curves')).not.toBeNull()
    })
    expect(tagSection('wallets')).toBeNull()
  })

  it('keeps the tag named in the address even when none of its articles match', async () => {
    useLibraryFilterSortStore.setState({ minimumLevel: 5, maximumLevel: 5 })
    renderTagsPage('/library/tags?tag=wallets')

    await waitFor(() => {
      expect(tagSection('wallets')).not.toBeNull()
    })
    expect(screen.getByText('No articles in this tag match the current filters.')).toBeInTheDocument()
  })

  it('shows one page message when every tag is filtered out', async () => {
    useLibraryFilterSortStore.setState({ query: 'zzzz-not-an-article' })
    renderTagsPage('/library/tags')

    expect(await screen.findByText('No articles match the current filters.')).toBeInTheDocument()
    expect(document.querySelector('[id^="library-tag-"]')).toBeNull()
  })

  it('names an inverted level range instead of a failed search', async () => {
    useLibraryFilterSortStore.setState({ minimumLevel: 4, maximumLevel: 2 })
    renderTagsPage('/library/tags')

    expect(
      await screen.findByText(
        'No article can have a minimum level higher than the maximum level. This logic implies that you see no articles here.',
      ),
    ).toBeInTheDocument()
    expect(document.querySelector('[id^="library-tag-"]')).toBeNull()
  })

  it('shows the empty-bookmarks message when Bookmarked matches nothing', async () => {
    useLibraryFilterSortStore.setState({ scope: 'bookmarks' })
    renderTagsPage('/library/tags')

    expect(
      await screen.findByText('No bookmarks yet. Open an article and tap the bookmark to add one.'),
    ).toBeInTheDocument()
    expect(document.querySelector('[id^="library-tag-"]')).toBeNull()
  })
})
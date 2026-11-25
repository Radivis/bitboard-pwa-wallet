import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { renderWithLibraryRouter } from '@/test-utils/library-router'
import type { LibraryArticle } from '@/lib/library/library-article'

const designTokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../design-tokens.css')
const designTokens = readFileSync(designTokensPath, 'utf8')

const bookmarkMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}))

const bookmarkQuery = vi.hoisted(() => ({
  slugs: new Set(['what-is-a-wallet']) as Set<string> | undefined,
}))

vi.mock('@/db', () => ({
  useLibraryBookmarks: () => ({
    data: bookmarkQuery.slugs,
    isLoading: bookmarkQuery.slugs == null,
  }),
  useSetArticleBookmark: () => ({
    mutateAsync: bookmarkMutation.mutateAsync,
    isPending: false,
    variables: undefined,
  }),
  usePendingBookmarkSlugs: () => new Set<string>(),
}))

const walletArticle: LibraryArticle = {
  slug: 'what-is-a-wallet',
  title: 'What is a wallet',
  level: 1,
  tagIds: ['bitcoin', 'wallets'],
  body: null,
}

describe('LibraryArticleList', () => {
  beforeEach(() => {
    bookmarkQuery.slugs = new Set(['what-is-a-wallet'])
    bookmarkMutation.mutateAsync.mockReset()
  })

  it('fits as many 240px columns as the row allows and lets them share it', async () => {
    renderWithLibraryRouter(
      <LibraryArticleList articles={[walletArticle]} emptyMessage="Nothing here." />,
    )

    const title = await screen.findByRole('link', { name: 'What is a wallet' })
    const list = title.closest('ul')
    expect(list).toHaveAttribute('data-slot', 'design-library-list')
    expect(list).toHaveAttribute('data-library-list-surface', 'raised')
    expect(list?.className).toContain('grid')
    expect(list?.className).toContain('gap-4')
    const listRulesStart = designTokens.indexOf('[data-slot="design-library-list"]')
    const listRules = designTokens.slice(listRulesStart, designTokens.indexOf('[data-slot="design-library-card"]'))
    expect(listRules).toContain('repeat(auto-fill, minmax(min(100%, 240px), 1fr))')
    expect(title.closest('[data-slot="design-library-card"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Beginner' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bitcoin' })).toHaveAttribute(
      'href',
      '/library/tags?tag=bitcoin',
    )
    expect(screen.getByRole('link', { name: 'Wallets' })).toBeInTheDocument()
  })

  it('omits the enclosing tag', async () => {
    renderWithLibraryRouter(
      <LibraryArticleList
        articles={[walletArticle]}
        emptyMessage="Nothing here."
        excludeTagId="bitcoin"
      />,
    )

    expect(await screen.findByRole('link', { name: 'What is a wallet' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Bitcoin' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wallets' })).toBeInTheDocument()
  })

  it('toggles a shown bookmark from the card', async () => {
    const user = userEvent.setup()
    renderWithLibraryRouter(
      <LibraryArticleList articles={[walletArticle]} emptyMessage="Nothing here." />,
    )

    await user.click(
      await screen.findByRole('button', { name: 'Remove What is a wallet from bookmarks' }),
    )
    expect(bookmarkMutation.mutateAsync).toHaveBeenCalledWith({
      articleSlug: 'what-is-a-wallet',
      isBookmarked: false,
    })
  })

  it('hides bookmark icons until the bookmark query returns', async () => {
    bookmarkQuery.slugs = undefined
    renderWithLibraryRouter(
      <LibraryArticleList articles={[walletArticle]} emptyMessage="Nothing here." />,
    )

    expect(await screen.findByRole('link', { name: 'What is a wallet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /bookmarks/i })).not.toBeInTheDocument()
  })

  it('shows the empty message when there are no articles', async () => {
    renderWithLibraryRouter(<LibraryArticleList articles={[]} emptyMessage="Nothing here." />)

    expect(await screen.findByText('Nothing here.')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="design-library-card"]')).toBeNull()
  })
})

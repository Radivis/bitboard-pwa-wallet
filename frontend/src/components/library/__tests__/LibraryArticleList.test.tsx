import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { renderWithLibraryRouter } from '@/test-utils/library-router'
import type { LibraryArticle } from '@/lib/library/library-article'

const designTokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../design-tokens.css')
const designTokens = readFileSync(designTokensPath, 'utf8')

const walletArticle: LibraryArticle = {
  slug: 'what-is-a-wallet',
  title: 'What is a wallet',
  level: 1,
  tagIds: ['bitcoin', 'wallets'],
  body: null,
}

describe('LibraryArticleList', () => {
  it('fits as many 240px columns as the row allows and lets them share it', async () => {
    renderWithLibraryRouter(
      <LibraryArticleList articles={[walletArticle]} emptyMessage="Nothing here." />,
    )

    const title = await screen.findByRole('link', { name: 'What is a wallet' })
    const list = title.closest('ul')
    expect(list).toHaveAttribute('data-slot', 'design-library-list')
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

  it('shows the empty message when there are no articles', async () => {
    renderWithLibraryRouter(<LibraryArticleList articles={[]} emptyMessage="Nothing here." />)

    expect(await screen.findByText('Nothing here.')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="design-library-card"]')).toBeNull()
  })
})

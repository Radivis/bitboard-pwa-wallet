import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DesignLibraryCard } from '@/components/design/DesignLibraryCard'
import { DesignTag } from '@/components/design/DesignTag'
import { renderWithLibraryRouter } from '@/test-utils/library-router'

const designTokensPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../design-tokens.css')
const designTokens = readFileSync(designTokensPath, 'utf8')

describe('DesignLibraryCard', () => {
  it('links the title to the article and keeps tag links and their hover fills', async () => {
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="What is a wallet"
        articleSlug="what-is-a-wallet"
        level={1}
        isBookmarked={false}
        tags={
          <DesignTag asChild>
            <a href="/library/tags?tag=bitcoin" data-library-tag="bitcoin">
              Bitcoin
            </a>
          </DesignTag>
        }
      />,
    )

    const title = await screen.findByRole('link', { name: 'What is a wallet' })
    expect(title).toHaveAttribute('href', '/library/articles/what-is-a-wallet')
    expect(title).toHaveAttribute('data-library-article', 'what-is-a-wallet')
    expect(title).toHaveAttribute('data-library-card-title')
    expect(title.className).toContain('design-type-emphasis')
    expect(title.className).toContain('text-[var(--design-text-regular)]')
    expect(title.className).toContain('after:inset-0')

    const tag = screen.getByRole('link', { name: 'Bitcoin' })
    expect(tag).toHaveAttribute('href', '/library/tags?tag=bitcoin')
    expect(tag).toHaveAttribute('data-library-tag', 'bitcoin')
    expect(tag).toHaveAttribute('data-slot', 'design-tag')
    expect(tag.className).toContain('hover:bg-[var(--design-nav-background-hover)]')
    expect(tag.className).toContain('active:bg-[var(--design-nav-background-active)]')
    expect(tag.parentElement?.className).toContain('z-10')
  })

  it('shows one graduation cap for each step of the specialization level', async () => {
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="Security models for cryptocurrencies and conventional currencies"
        articleSlug="security-models-for-cryptocurrencies-and-conventional-currencies"
        level={2}
        isBookmarked={false}
      />,
    )

    const level = await screen.findByRole('img', { name: 'Intermediate' })
    expect(level.className).toContain('justify-center')
    expect(level.className).toContain('gap-2')
    expect(level.querySelectorAll('svg')).toHaveLength(2)
  })

  it('fills its grid cell, with a 20px radius and a 16px stack gap', async () => {
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="What is a wallet"
        articleSlug="what-is-a-wallet"
        level={1}
        isBookmarked={false}
      />,
    )

    const title = await screen.findByRole('link', { name: 'What is a wallet' })
    const card = title.closest('[data-slot="design-library-card"]')
    expect(card?.className).toContain('rounded-[20px]')
    expect(card?.className).toContain('h-full')
    expect(card?.className).toContain('w-full')
    expect(card?.className).toContain('max-w-[480px]')
    expect(card?.className).toContain('gap-4')
    expect(card?.className).toContain('px-6')
    expect(card?.className).toContain('py-3')
  })

  it('uses the relative elevation 1 and 2 shadow stacks', () => {
    const cardRulesStart = designTokens.indexOf('[data-slot="design-library-card"]')
    const cardRules = designTokens.slice(cardRulesStart, designTokens.indexOf('[data-slot="design-modal"]'))
    expect(cardRules).toContain('--design-elevation-2')
    expect(cardRules).toContain('--design-elevation-3')
    expect(cardRules).toContain('[data-library-list-surface="page"] [data-slot="design-library-card"]')
    expect(cardRules).toContain('--design-elevation-1')
    expect(cardRules).toContain('0 1px 3px 1px rgb(0 0 0 / 0.15)')
    expect(cardRules).toContain('0 3px 8px 0 rgb(0 0 0 / 0.25)')
    expect(cardRules).toContain('inset 0 4px 7px 0 rgb(245 244 246 / 0.08)')
    expect(cardRules).toContain('0 2px 6px 2px rgb(0 0 0 / 0.15)')
    expect(cardRules).toContain('0 4px 10px 0 rgb(0 0 0 / 0.25)')
    expect(cardRules).toContain('inset 0 4px 9px 0 rgb(236 235 239 / 0.08)')
    expect(cardRules).not.toContain('0 5px 12px 0 rgb(0 0 0 / 0.25)')
  })

  it('keeps the bookmark control off the article link', async () => {
    const user = userEvent.setup()
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="What is a wallet"
        articleSlug="what-is-a-wallet"
        level={1}
        isBookmarked={false}
      />,
    )

    const bookmark = await screen.findByRole('button', { name: 'Add What is a wallet to bookmarks' })
    expect(bookmark).toHaveAttribute('aria-pressed', 'false')
    expect(bookmark).toHaveAttribute('data-library-bookmark', 'what-is-a-wallet')
    expect(bookmark.className).toContain('absolute')
    expect(bookmark.className).toContain('bottom-3')
    expect(bookmark.className).toContain('right-4')
    expect(bookmark.className).toContain('z-10')
    expect(bookmark.className).toContain('size-6')
    await user.click(bookmark)
    expect(screen.getByRole('link', { name: 'What is a wallet' })).toHaveAttribute(
      'href',
      '/library/articles/what-is-a-wallet',
    )
  })

  it('fills the bookmark when the article is already bookmarked', async () => {
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="What is a wallet"
        articleSlug="what-is-a-wallet"
        level={1}
        isBookmarked
      />,
    )

    const bookmark = await screen.findByRole('button', { name: 'Remove What is a wallet from bookmarks' })
    expect(bookmark).toHaveAttribute('aria-pressed', 'true')
    expect(bookmark.className).toContain('text-[var(--design-text-regular)]')
    expect(bookmark.querySelector('svg')?.getAttribute('class')).toContain('fill-current')
  })

  it('omits the bookmark icon until the caller knows the bookmark state', async () => {
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="What is a wallet"
        articleSlug="what-is-a-wallet"
        level={1}
        isBookmarked={false}
        showBookmark={false}
      />,
    )

    expect(await screen.findByRole('link', { name: 'What is a wallet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /bookmarks/i })).not.toBeInTheDocument()
  })

  it('disables the bookmark while that bookmark is still saving', async () => {
    renderWithLibraryRouter(
      <DesignLibraryCard
        title="What is a wallet"
        articleSlug="what-is-a-wallet"
        level={1}
        isBookmarked
        bookmarkPending
      />,
    )

    const bookmark = await screen.findByRole('button', { name: 'Remove What is a wallet from bookmarks' })
    expect(bookmark).toBeDisabled()
    expect(bookmark.className).toContain('disabled:text-[var(--design-text-button-tertiary-disabled)]')
  })
})

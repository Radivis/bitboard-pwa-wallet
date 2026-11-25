import { describe, expect, it } from 'vitest'

import type { LibraryArticle } from '@/lib/library/library-article'
import { applyLibraryFilterSort } from '@/lib/library/library-filter-sort'
import type { LibraryLevel } from '@/lib/library/library-level'
import type { LibraryTagId } from '@/lib/library/tags'

function article(title: string, level: LibraryLevel, tagIds: LibraryTagId[] = []): LibraryArticle {
  return {
    slug: title.toLowerCase().replaceAll(' ', '-'),
    title,
    level,
    tagIds,
    body: null,
  }
}

const wallet = article('What is a wallet', 1, ['wallets'])
const dust = article('Dust Transactions', 3, ['bitcoin'])
const ecdsa = article('ECDSA', 5, ['cryptography'])
const signatures = article('Cryptographic signatures', 3, ['cryptography'])

const openCriteria = {
  query: '',
  minimumLevel: 1 as const,
  maximumLevel: 5 as const,
  sort: 'title-asc' as const,
  scope: 'all' as const,
}

describe('applyLibraryFilterSort', () => {
  it('matches a title or a tag label, ignoring case and surrounding space', () => {
    const articles = [wallet, dust, ecdsa]
    expect(applyLibraryFilterSort(articles, { ...openCriteria, query: '  DUST ' }).map((item) => item.title)).toEqual([
      'Dust Transactions',
    ])
    expect(applyLibraryFilterSort(articles, { ...openCriteria, query: 'wallet' }).map((item) => item.title)).toEqual([
      'What is a wallet',
    ])
  })

  it('keeps articles inside the inclusive level bounds', () => {
    const articles = [wallet, dust, signatures, ecdsa]
    expect(
      applyLibraryFilterSort(articles, { ...openCriteria, minimumLevel: 3, maximumLevel: 3 }).map(
        (item) => item.title,
      ),
    ).toEqual(['Cryptographic signatures', 'Dust Transactions'])
  })

  it('matches nothing when the minimum level is above the maximum', () => {
    expect(
      applyLibraryFilterSort([wallet, ecdsa], { ...openCriteria, minimumLevel: 4, maximumLevel: 2 }),
    ).toEqual([])
  })

  it('sorts titles in either direction', () => {
    const articles = [dust, wallet, ecdsa]
    expect(applyLibraryFilterSort(articles, openCriteria).map((item) => item.title)).toEqual([
      'Dust Transactions',
      'ECDSA',
      'What is a wallet',
    ])
    expect(
      applyLibraryFilterSort(articles, { ...openCriteria, sort: 'title-desc' }).map((item) => item.title),
    ).toEqual(['What is a wallet', 'ECDSA', 'Dust Transactions'])
  })

  it('keeps only starred articles when the scope is favorites', () => {
    const articles = [wallet, dust, ecdsa]
    const favoriteSlugs = new Set([wallet.slug, ecdsa.slug])
    expect(
      applyLibraryFilterSort(articles, { ...openCriteria, scope: 'favorites' }, favoriteSlugs).map(
        (item) => item.title,
      ),
    ).toEqual(['ECDSA', 'What is a wallet'])
    expect(applyLibraryFilterSort(articles, openCriteria, favoriteSlugs).map((item) => item.title)).toEqual([
      'Dust Transactions',
      'ECDSA',
      'What is a wallet',
    ])
  })

  it('sorts by level and breaks ties by title A to Z', () => {
    const articles = [signatures, ecdsa, dust, wallet]
    expect(
      applyLibraryFilterSort(articles, { ...openCriteria, sort: 'level-asc' }).map((item) => item.title),
    ).toEqual(['What is a wallet', 'Cryptographic signatures', 'Dust Transactions', 'ECDSA'])
    expect(
      applyLibraryFilterSort(articles, { ...openCriteria, sort: 'level-desc' }).map((item) => item.title),
    ).toEqual(['ECDSA', 'Cryptographic signatures', 'Dust Transactions', 'What is a wallet'])
  })
})

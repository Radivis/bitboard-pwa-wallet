import type { LibraryArticle } from '@/lib/library/library-article'
import type { LibraryLevel } from '@/lib/library/library-level'
import { getTagLabel } from '@/lib/library/tags'

export type LibraryArticleSort = 'title-asc' | 'title-desc' | 'level-asc' | 'level-desc'

export type LibraryArticleScope = 'all' | 'bookmarks'

export interface LibraryFilterSortCriteria {
  query: string
  minimumLevel: LibraryLevel
  maximumLevel: LibraryLevel
  sort: LibraryArticleSort
  scope: LibraryArticleScope
}

export const LIBRARY_INVERTED_LEVEL_RANGE_MESSAGE =
  'No article can have a minimum level higher than the maximum level. This logic implies that you see no articles here.'

export function libraryFilterEmptyMessage(
  criteria: Pick<LibraryFilterSortCriteria, 'scope' | 'minimumLevel' | 'maximumLevel'>,
  bookmarkCount: number,
): string {
  if (criteria.minimumLevel > criteria.maximumLevel) return LIBRARY_INVERTED_LEVEL_RANGE_MESSAGE
  if (criteria.scope === 'bookmarks' && bookmarkCount === 0) {
    return 'No bookmarks yet. Open an article and tap the bookmark to add one.'
  }
  if (criteria.scope === 'bookmarks') return 'No bookmarks match the current filters.'
  return 'No articles match the current filters.'
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function articleMatchesQuery(article: LibraryArticle, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  if (article.title.toLowerCase().includes(normalizedQuery)) return true
  return article.tagIds.some((tagId) => getTagLabel(tagId).toLowerCase().includes(normalizedQuery))
}

function compareTitles(left: LibraryArticle, right: LibraryArticle): number {
  return left.title.localeCompare(right.title)
}

function compareArticles(left: LibraryArticle, right: LibraryArticle, sort: LibraryArticleSort): number {
  if (sort === 'title-asc') return compareTitles(left, right)
  if (sort === 'title-desc') return compareTitles(right, left)
  const levelOrder = sort === 'level-asc' ? left.level - right.level : right.level - left.level
  if (levelOrder !== 0) return levelOrder
  return compareTitles(left, right)
}

function articleIsInScope(
  article: LibraryArticle,
  criteria: LibraryFilterSortCriteria,
  bookmarkSlugs: ReadonlySet<string> | undefined,
): boolean {
  if (criteria.scope !== 'bookmarks') return true
  return bookmarkSlugs?.has(article.slug) === true
}

export function applyLibraryFilterSort(
  articles: readonly LibraryArticle[],
  criteria: LibraryFilterSortCriteria,
  bookmarkSlugs?: ReadonlySet<string>,
): LibraryArticle[] {
  if (criteria.minimumLevel > criteria.maximumLevel) return []
  const normalizedQuery = normalizeSearch(criteria.query)
  return articles
    .filter(
      (article) =>
        articleIsInScope(article, criteria, bookmarkSlugs) &&
        article.level >= criteria.minimumLevel &&
        article.level <= criteria.maximumLevel &&
        articleMatchesQuery(article, normalizedQuery),
    )
    .sort((left, right) => compareArticles(left, right, criteria.sort))
}

import type { LibraryArticle } from '@/lib/library/library-article'
import type { LibraryLevel } from '@/lib/library/library-level'
import { getTagLabel } from '@/lib/library/tags'

export type LibraryArticleSort = 'title-asc' | 'title-desc' | 'level-asc' | 'level-desc'

export interface LibraryFilterSortCriteria {
  query: string
  minimumLevel: LibraryLevel
  maximumLevel: LibraryLevel
  sort: LibraryArticleSort
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

export function applyLibraryFilterSort(
  articles: readonly LibraryArticle[],
  criteria: LibraryFilterSortCriteria,
): LibraryArticle[] {
  if (criteria.minimumLevel > criteria.maximumLevel) return []
  const normalizedQuery = normalizeSearch(criteria.query)
  return articles
    .filter(
      (article) =>
        article.level >= criteria.minimumLevel &&
        article.level <= criteria.maximumLevel &&
        articleMatchesQuery(article, normalizedQuery),
    )
    .sort((left, right) => compareArticles(left, right, criteria.sort))
}

/* eslint-disable react-refresh/only-export-components -- public API for library article registry */
import { ARTICLES, ARTICLE_SLUGS, type ArticleSlug } from './articles-registry'
import type { LibraryArticle } from './library-article'

export { ARTICLE_SLUGS, type ArticleSlug, type LibraryArticle }
export { LIBRARY_ARTICLE_TITLE_CLASS } from './article-shared'

export function isArticleSlug(value: string): value is ArticleSlug {
  return Object.prototype.hasOwnProperty.call(ARTICLES, value)
}

export function getArticle(slug: string): LibraryArticle | undefined {
  if (!isArticleSlug(slug)) return undefined
  return ARTICLES[slug]
}

export function listArticles(): LibraryArticle[] {
  return ARTICLE_SLUGS.map((slug) => ARTICLES[slug])
}

/** All articles sorted by display title (stable locale compare). */
export function listArticlesSortedByTitle(): LibraryArticle[] {
  return [...listArticles()].sort((a, b) => a.title.localeCompare(b.title))
}

/** If `accessPath` is `/library/articles/<slug>`, returns article title for display. */
export function resolveHistoryPathLabel(accessPath: string): string | null {
  const slug = articleSlugFromAccessPath(accessPath)
  if (!slug) return null
  const article = getArticle(slug)
  return article?.title ?? null
}

export function articleSlugFromAccessPath(accessPath: string): string | null {
  const prefix = '/library/articles/'
  if (!accessPath.startsWith(prefix)) return null
  const slug = accessPath.slice(prefix.length)
  return slug.length > 0 ? slug : null
}

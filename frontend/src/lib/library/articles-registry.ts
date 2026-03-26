/**
 * Article modules are discovered at build time via Vite `import.meta.glob` (no manual import list).
 * Each file must export `article` with `slug` equal to its basename without `.tsx`.
 * TanStack Router ignores the same files via `libraryArticleRouteIgnorePattern()` in `vite.config.ts` (reads the directory at config load).
 */
import type { LibraryArticle } from './library-article'

const articleModules = import.meta.glob<{ article: LibraryArticle }>(
  '../../routes/library/articles/*.tsx',
  { eager: true },
)

function slugFromModulePath(modulePath: string): string {
  const segment = modulePath.split('/').pop() ?? ''
  return segment.replace(/\.tsx$/i, '')
}

function buildArticlesRecord(): Record<string, LibraryArticle> {
  const out: Record<string, LibraryArticle> = {}
  for (const [modulePath, mod] of Object.entries(articleModules)) {
    const slug = slugFromModulePath(modulePath)
    if (mod.article.slug !== slug) {
      throw new Error(
        `Library article slug mismatch: file "${modulePath}" exports slug "${mod.article.slug}" but filename implies "${slug}"`,
      )
    }
    out[slug] = mod.article
  }
  return out
}

export const ARTICLES = buildArticlesRecord()

/** Sorted slugs (stable ordering for index and tags). */
export const ARTICLE_SLUGS = Object.keys(ARTICLES).sort((a, b) => a.localeCompare(b)) as readonly string[]

export type ArticleSlug = (typeof ARTICLE_SLUGS)[number]

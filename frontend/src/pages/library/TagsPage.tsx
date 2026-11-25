import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Tags as TagsIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DesignCard } from '@/components/design/DesignCard'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { useLibraryCatalogClick } from '@/components/library/useLibraryCatalogClick'
import { LibraryFilterSort } from '@/components/library/LibraryFilterSort'
import { PageHeader } from '@/components/PageHeader'
import { useLibraryBookmarks } from '@/db'
import { listArticles, type LibraryArticle } from '@/lib/library/articles'
import {
  applyLibraryFilterSort,
  LIBRARY_INVERTED_LEVEL_RANGE_MESSAGE,
  libraryFilterEmptyMessage,
  type LibraryFilterSortCriteria,
} from '@/lib/library/library-filter-sort'
import {
  getTagLabel,
  isLibraryTagId,
  listLibraryTagIdsSortedByLabel,
  type LibraryTagId,
} from '@/lib/library/tags'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

function buildArticlesByTagId(): Map<LibraryTagId, LibraryArticle[]> {
  const map = new Map<LibraryTagId, LibraryArticle[]>()
  for (const article of listArticles()) {
    for (const tagId of article.tagIds) {
      if (!isLibraryTagId(tagId)) continue
      const existing = map.get(tagId)
      if (existing) existing.push(article)
      else map.set(tagId, [article])
    }
  }
  return map
}

function shouldShowTagSection(
  articleCount: number,
  visibleArticleCount: number,
  isFocused: boolean,
): boolean {
  if (isFocused) return true
  if (articleCount === 0) return true
  return visibleArticleCount > 0
}

function tagSectionEmptyMessage(
  articleCount: number,
  criteria: Pick<LibraryFilterSortCriteria, 'minimumLevel' | 'maximumLevel'>,
): string {
  if (articleCount === 0) return 'No articles use this tag yet.'
  if (criteria.minimumLevel > criteria.maximumLevel) return LIBRARY_INVERTED_LEVEL_RANGE_MESSAGE
  return 'No articles in this tag match the current filters.'
}

function TagSection({
  tagId,
  articles,
  visibleArticles,
  isFocused,
  criteria,
}: {
  tagId: LibraryTagId
  articles: LibraryArticle[]
  visibleArticles: LibraryArticle[]
  isFocused: boolean
  criteria: Pick<LibraryFilterSortCriteria, 'minimumLevel' | 'maximumLevel'>
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!isFocused || !detailsRef.current) return
    detailsRef.current.open = true
    requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [isFocused, tagId])

  return (
    <DesignCard>
      <details
        ref={detailsRef}
        id={`library-tag-${tagId}`}
        className="group"
      >
        <summary className="design-type-emphasis design-ui cursor-pointer list-none px-6 py-6 text-[var(--design-text-card-title)] marker:content-none group-open:pb-4 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex w-full items-center justify-between gap-2">
            <span>{getTagLabel(tagId)}</span>
            <span className="design-type-regular text-[var(--design-text-card-description)]">
              {visibleArticles.length} article{visibleArticles.length === 1 ? '' : 's'}
            </span>
          </span>
        </summary>
        <CardContentPadding>
          <LibraryArticleList
            articles={visibleArticles}
            emptyMessage={tagSectionEmptyMessage(articles.length, criteria)}
            excludeTagId={tagId}
          />
        </CardContentPadding>
      </details>
    </DesignCard>
  )
}

function CardContentPadding({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-[var(--design-stroke-card)] px-6 pt-4 pb-6">{children}</div>
  )
}

interface VisibleTagSection {
  tagId: LibraryTagId
  articles: LibraryArticle[]
  visibleArticles: LibraryArticle[]
}

export function TagsPage() {
  const { tag: focusedTag } = useSearch({ from: '/library/tags' })
  const tagIds = useMemo(() => listLibraryTagIdsSortedByLabel(), [])
  const articlesByTagId = useMemo(() => buildArticlesByTagId(), [])
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))
  const { data: bookmarkSlugs, isLoading } = useLibraryBookmarks()
  const bookmarksAreLoading = criteria.scope === 'bookmarks' && isLoading
  const onCatalogClick = useLibraryCatalogClick(bookmarkSlugs)
  const sections = useMemo(() => {
    const shown: VisibleTagSection[] = []
    for (const tagId of tagIds) {
      const articles = articlesByTagId.get(tagId) ?? []
      const visibleArticles = applyLibraryFilterSort(articles, criteria, bookmarkSlugs)
      if (!shouldShowTagSection(articles.length, visibleArticles.length, focusedTag === tagId)) continue
      shown.push({ tagId, articles, visibleArticles })
    }
    return shown
  }, [articlesByTagId, criteria, bookmarkSlugs, focusedTag, tagIds])

  return (
    <div className="space-y-6" onClick={onCatalogClick}>
      <PageHeader title="Tags" icon={TagsIcon} />

      <p className="design-type-regular text-muted-foreground">
        Expand a tag to see articles that reference it. The same article can appear under several
        tags.
      </p>

      <LibraryFilterSort />

      {bookmarksAreLoading ? (
        <p className="design-type-regular text-muted-foreground">Loading…</p>
      ) : sections.length === 0 ? (
        <p className="design-type-regular text-muted-foreground">
          {libraryFilterEmptyMessage(criteria, bookmarkSlugs?.size ?? 0)}
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <TagSection
              key={section.tagId}
              tagId={section.tagId}
              articles={section.articles}
              visibleArticles={section.visibleArticles}
              isFocused={focusedTag === section.tagId}
              criteria={criteria}
            />
          ))}
        </div>
      )}
    </div>
  )
}

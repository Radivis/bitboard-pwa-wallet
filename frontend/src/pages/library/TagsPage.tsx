import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Tags as TagsIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DesignCard } from '@/components/design/DesignCard'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { LibraryFilterSort } from '@/components/library/LibraryFilterSort'
import { PageHeader } from '@/components/PageHeader'
import { listArticles, type LibraryArticle } from '@/lib/library/articles'
import { applyLibraryFilterSort } from '@/lib/library/library-filter-sort'
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

function TagSection({
  tagId,
  articles,
}: {
  tagId: LibraryTagId
  articles: LibraryArticle[]
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const { tag: focusedTag } = useSearch({ from: '/library/tags' })
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))
  const visibleArticles = useMemo(
    () => applyLibraryFilterSort(articles, criteria),
    [articles, criteria],
  )
  const isFocused = focusedTag === tagId

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
            emptyMessage={
              articles.length === 0
                ? 'No articles use this tag yet.'
                : 'No articles in this tag match the current filters.'
            }
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

export function TagsPage() {
  const tagIds = listLibraryTagIdsSortedByLabel()
  const articlesByTagId = useMemo(() => buildArticlesByTagId(), [])

  return (
    <div className="space-y-6">
      <PageHeader title="Tags" icon={TagsIcon} />

      <p className="design-type-regular text-muted-foreground">
        Expand a tag to see articles that reference it. The same article can appear under several
        tags.
      </p>

      <LibraryFilterSort />

      <div className="space-y-3">
        {tagIds.map((tagId) => (
          <TagSection
            key={tagId}
            tagId={tagId}
            articles={articlesByTagId.get(tagId) ?? []}
          />
        ))}
      </div>
    </div>
  )
}

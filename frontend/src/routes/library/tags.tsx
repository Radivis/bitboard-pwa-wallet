import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Tags as TagsIcon } from 'lucide-react'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { LibraryPageHeader } from '@/components/library/LibraryPageHeader'
import { listArticlesSortedByTitle, type LibraryArticle } from '@/lib/library/articles'
import {
  getTagLabel,
  isLibraryTagId,
  listLibraryTagIdsSortedByLabel,
  type LibraryTagId,
} from '@/lib/library/tags'

export const Route = createFileRoute('/library/tags')({
  validateSearch: (search: Record<string, unknown>): { tag?: LibraryTagId } => {
    const raw = search.tag
    if (typeof raw !== 'string' || !isLibraryTagId(raw)) return {}
    return { tag: raw }
  },
  component: LibraryTagsPage,
})

function buildArticlesByTagId(): Map<LibraryTagId, LibraryArticle[]> {
  const map = new Map<LibraryTagId, LibraryArticle[]>()
  for (const article of listArticlesSortedByTitle()) {
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
  const { tag: focusedTag } = Route.useSearch()
  const isFocused = focusedTag === tagId

  useEffect(() => {
    if (!isFocused || !detailsRef.current) return
    detailsRef.current.open = true
    requestAnimationFrame(() => {
      detailsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [isFocused, tagId])

  return (
    <details
      ref={detailsRef}
      id={`library-tag-${tagId}`}
      className="group rounded-lg border border-border"
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex w-full items-center justify-between gap-2">
          <span>{getTagLabel(tagId)}</span>
          <span className="text-xs text-muted-foreground">
            {articles.length} article{articles.length === 1 ? '' : 's'}
          </span>
        </span>
      </summary>
      <CardContentPadding>
        <LibraryArticleList
          articles={articles}
          emptyMessage="No articles use this tag yet."
          showTags={false}
        />
      </CardContentPadding>
    </details>
  )
}

function CardContentPadding({ children }: { children: ReactNode }) {
  return <div className="border-t border-border px-4 pb-4 pt-2">{children}</div>
}

function LibraryTagsPage() {
  const tagIds = listLibraryTagIdsSortedByLabel()
  const articlesByTagId = useMemo(() => buildArticlesByTagId(), [])

  return (
    <div className="space-y-6">
      <LibraryPageHeader title="Tags" icon={TagsIcon} />

      <p className="text-sm text-muted-foreground">
        Expand a tag to see articles that reference it. The same article can appear under several
        tags.
      </p>

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

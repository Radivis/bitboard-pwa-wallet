import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Tags as TagsIcon } from 'lucide-react'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { listArticles } from '@/lib/library/articles'
import { getTagLabel, listLibraryTagIdsSortedByLabel, type LibraryTagId } from '@/lib/library/tags'

export const Route = createFileRoute('/library/tags')({
  component: LibraryTagsPage,
})

function TagSection({ tagId }: { tagId: LibraryTagId }) {
  const articles = listArticles()
    .filter((a) => a.tagIds.includes(tagId))
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <details className="group rounded-lg border border-border">
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

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <TagsIcon className="h-8 w-8" aria-hidden />
        Tags
      </h2>

      <p className="text-sm text-muted-foreground">
        Expand a tag to see articles that reference it. The same article can appear under several
        tags.
      </p>

      <div>
        <Link
          to="/library"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Back to Library index
        </Link>
      </div>

      <div className="space-y-3">
        {tagIds.map((tagId) => (
          <TagSection key={tagId} tagId={tagId} />
        ))}
      </div>
    </div>
  )
}

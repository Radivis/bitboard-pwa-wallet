import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LibraryArticle } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'

interface LibraryArticleListProps {
  articles: LibraryArticle[]
  emptyMessage: string
  /** When false, only the title link is shown (e.g. under a tag section). Default true. */
  showTags?: boolean
}

export function LibraryArticleList({
  articles,
  emptyMessage,
  showTags = true,
}: LibraryArticleListProps) {
  if (articles.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul
      className={cn(
        'divide-y divide-border rounded-lg border border-border',
        showTags ? '' : 'bg-muted/20',
      )}
    >
      {articles.map((article) => (
        <li key={article.slug}>
          <div
            className={cn(
              'flex flex-wrap items-baseline gap-x-3 gap-y-2 px-3 py-2 sm:items-center sm:py-1.5',
              showTags ? 'justify-between' : '',
            )}
          >
            <Link
              to="/library/articles/$slug"
              params={{ slug: article.slug }}
              className="min-w-0 flex-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              {article.title}
            </Link>
            {showTags && article.tagIds.length > 0 ? (
              <div className="flex max-w-full flex-wrap gap-1.5 sm:justify-end">
                {article.tagIds.map((tagId) => (
                  <Badge key={tagId} variant="secondary" asChild>
                    <Link
                      to="/library/tags"
                      search={{ tag: tagId }}
                      className="cursor-pointer"
                    >
                      {getTagLabel(tagId)}
                    </Link>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

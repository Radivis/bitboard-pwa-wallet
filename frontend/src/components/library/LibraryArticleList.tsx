import { Link } from '@tanstack/react-router'
import { DesignTag } from '@/components/design/DesignTag'
import type { LibraryArticle } from '@/lib/library/articles'
import { getTagLabel, type LibraryTagId } from '@/lib/library/tags'

interface LibraryArticleListProps {
  articles: LibraryArticle[]
  emptyMessage: string
  /** When set, tag badges omit this id (e.g. the tag for the enclosing section on /library/tags). */
  excludeTagId?: LibraryTagId
}

export function LibraryArticleList({
  articles,
  emptyMessage,
  excludeTagId,
}: LibraryArticleListProps) {
  if (articles.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul className="divide-y divide-border">
      {articles.map((article) => {
        const tagIdsToShow =
          excludeTagId != null
            ? article.tagIds.filter((id) => id !== excludeTagId)
            : article.tagIds
        return (
          <li key={article.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-3 py-2 sm:items-center sm:py-1.5">
              <Link
                to="/library/articles/$slug"
                params={{ slug: article.slug }}
                className="min-w-0 flex-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                {article.title}
              </Link>
              {tagIdsToShow.length > 0 ? (
                <div className="flex max-w-full flex-wrap gap-3 sm:justify-end">
                  {tagIdsToShow.map((tagId) => (
                    <DesignTag key={tagId} asChild>
                      <Link to="/library/tags" search={{ tag: tagId }}>
                        {getTagLabel(tagId)}
                      </Link>
                    </DesignTag>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

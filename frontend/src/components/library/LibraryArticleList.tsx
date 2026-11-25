import { Link } from '@tanstack/react-router'
import { DesignLibraryCard } from '@/components/design/DesignLibraryCard'
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
    return <p className="design-type-regular text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4 p-0">
      {articles.map((article) => {
        const tagIdsToShow =
          excludeTagId != null
            ? article.tagIds.filter((id) => id !== excludeTagId)
            : article.tagIds
        return (
          <li key={article.slug} className="min-w-0">
            <DesignLibraryCard
              title={article.title}
              articleSlug={article.slug}
              tags={
                tagIdsToShow.length > 0
                  ? tagIdsToShow.map((tagId) => (
                      <DesignTag key={tagId} asChild>
                        <Link to="/library/tags" search={{ tag: tagId }}>
                          {getTagLabel(tagId)}
                        </Link>
                      </DesignTag>
                    ))
                  : undefined
              }
            />
          </li>
        )
      })}
    </ul>
  )
}

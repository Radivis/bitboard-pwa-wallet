import { DesignLibraryCard } from '@/components/design/DesignLibraryCard'
import { DesignTag } from '@/components/design/DesignTag'
import { useLibraryBookmarks, usePendingBookmarkSlugs } from '@/db'
import type { LibraryArticle } from '@/lib/library/articles'
import { libraryTagHref } from '@/lib/library/library-catalog-click'
import { getTagLabel, type LibraryTagId } from '@/lib/library/tags'

interface LibraryArticleListProps {
  articles: LibraryArticle[]
  emptyMessage: string
  /**
   * `page` sits on the page background, so each card uses the lower fill.
   * `raised` sits inside another card, which is the tag section.
   */
  surface?: 'page' | 'raised'
  /** When set, tag badges omit this id (e.g. the tag for the enclosing section on /library/tags). */
  excludeTagId?: LibraryTagId
}

export function LibraryArticleList({
  articles,
  emptyMessage,
  surface = 'raised',
  excludeTagId,
}: LibraryArticleListProps) {
  const { data: bookmarkSlugs } = useLibraryBookmarks()
  const pendingBookmarkSlugs = usePendingBookmarkSlugs()
  const bookmarksHaveLoaded = bookmarkSlugs != null

  if (articles.length === 0) {
    return <p className="design-type-regular text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <ul
      data-slot="design-library-list"
      data-library-list-surface={surface}
      className="grid list-none gap-4 p-0"
    >
      {articles.map((article) => {
        const tagIdsToShow =
          excludeTagId != null
            ? article.tagIds.filter((id) => id !== excludeTagId)
            : article.tagIds
        const isBookmarked = bookmarkSlugs?.has(article.slug) === true
        return (
          <li key={article.slug} className="min-w-0">
            <DesignLibraryCard
              title={article.title}
              articleSlug={article.slug}
              level={article.level}
              isBookmarked={isBookmarked}
              showBookmark={bookmarksHaveLoaded}
              bookmarkPending={pendingBookmarkSlugs.has(article.slug)}
              tags={
                tagIdsToShow.length > 0
                  ? tagIdsToShow.map((tagId) => (
                      <DesignTag key={tagId} asChild>
                        <a href={libraryTagHref(tagId)} data-library-tag={tagId}>
                          {getTagLabel(tagId)}
                        </a>
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

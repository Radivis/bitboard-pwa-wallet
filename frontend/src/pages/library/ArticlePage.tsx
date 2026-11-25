import { Link, useParams } from '@tanstack/react-router'
import { Bookmark } from 'lucide-react'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignTag } from '@/components/design/DesignTag'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { useLibraryBookmarks, usePendingBookmarkSlugs, useSetArticleBookmark } from '@/db'
import { getArticle, isArticleSlug, LIBRARY_ARTICLE_TITLE_CLASS } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'
import { cn } from '@/lib/shared/utils'

export function ArticlePage() {
  const { slug } = useParams({ from: '/library/articles/$slug' })
  const article = getArticle(slug)
  const { data: bookmarkSlugs } = useLibraryBookmarks()
  const setBookmark = useSetArticleBookmark()
  const pendingBookmarkSlugs = usePendingBookmarkSlugs()

  const bookmarksHaveLoaded = bookmarkSlugs != null
  const isBookmarked = isArticleSlug(slug) && bookmarkSlugs?.has(slug) === true

  if (!article) {
    return (
      <div className="space-y-6">
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Article not found</DesignCardTitle>
          </DesignCardHeader>
          <DesignCardContent className="design-type-regular text-[var(--design-text-card-description)]">
            <p>
              There is no article with this address. Check the link or pick a topic from the Library
              index.
            </p>
          </DesignCardContent>
        </DesignCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className={LIBRARY_ARTICLE_TITLE_CLASS}>{article.title}</h2>
          {bookmarksHaveLoaded ? (
            <DesignButton
              type="button"
              appearance="tertiary"
              className="h-12 w-12 shrink-0 px-0"
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'Remove from bookmarks' : 'Add to bookmarks'}
              disabled={pendingBookmarkSlugs.has(article.slug)}
              icon={
                <Bookmark
                  className={cn(isBookmarked && 'fill-primary text-primary')}
                  aria-hidden
                />
              }
              onClick={() =>
                void setBookmark.mutateAsync({
                  articleSlug: article.slug,
                  isBookmarked: !isBookmarked,
                })
              }
            />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          {article.tagIds.map((tagId) => (
            <DesignTag key={tagId} asChild>
              <Link to="/library/tags" search={{ tag: tagId }}>
                {getTagLabel(tagId)}
              </Link>
            </DesignTag>
          ))}
        </div>
      </header>

      <DesignCard>
        <DesignCardContent>{article.body}</DesignCardContent>
      </DesignCard>
    </div>
  )
}

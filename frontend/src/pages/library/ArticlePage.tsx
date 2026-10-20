import { useParams } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { Badge } from '@/components/ui/badge'
import { useLibraryFavorites, useSetArticleFavorite } from '@/db'
import { getArticle, isArticleSlug, LIBRARY_ARTICLE_TITLE_CLASS } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'
import { cn } from '@/lib/shared/utils'

export function ArticlePage() {
  const { slug } = useParams({ from: '/library/articles/$slug' })
  const article = getArticle(slug)
  const { data: favoriteSlugs } = useLibraryFavorites()
  const setFavorite = useSetArticleFavorite()

  const isFavorite =
    isArticleSlug(slug) && favoriteSlugs ? favoriteSlugs.has(slug) : false

  if (!article) {
    return (
      <div className="space-y-6">
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Article not found</DesignCardTitle>
          </DesignCardHeader>
          <DesignCardContent className="text-sm text-[var(--design-text-card-description)]">
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
          <DesignButton
            type="button"
            appearance="tertiary"
            className="h-12 w-12 shrink-0 px-0"
            aria-pressed={isFavorite}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            disabled={setFavorite.isPending}
            icon={
              <Star
                className={cn(isFavorite && 'fill-primary text-primary')}
                aria-hidden
              />
            }
            onClick={() =>
              void setFavorite.mutateAsync({
                articleSlug: article.slug,
                isFavorite: !isFavorite,
              })
            }
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {article.tagIds.map((tagId) => (
            <Badge key={tagId} variant="secondary">
              {getTagLabel(tagId)}
            </Badge>
          ))}
        </div>
      </header>

      <DesignCard>
        <DesignCardContent>{article.body}</DesignCardContent>
      </DesignCard>
    </div>
  )
}

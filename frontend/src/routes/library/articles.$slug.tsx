import { createFileRoute } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import {
  BackToLibraryLink,
  LIBRARY_SUBPAGE_TOP_ROW_CLASS,
} from '@/components/library/BackToLibraryLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLibraryFavorites, useSetArticleFavorite } from '@/db'
import { getArticle, isArticleSlug, LIBRARY_ARTICLE_TITLE_CLASS } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/library/articles/$slug')({
  component: LibraryArticlePage,
})

function LibraryArticlePage() {
  const { slug } = Route.useParams()
  const article = getArticle(slug)
  const { data: favoriteSlugs } = useLibraryFavorites()
  const setFavorite = useSetArticleFavorite()

  const isFavorite =
    isArticleSlug(slug) && favoriteSlugs ? favoriteSlugs.has(slug) : false

  if (!article) {
    return (
      <div className="space-y-6">
        <div className={LIBRARY_SUBPAGE_TOP_ROW_CLASS}>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Article not found</h2>
          <BackToLibraryLink />
        </div>
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            <p>
              There is no article with this address. Check the link or pick a topic from the Library
              index.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className={LIBRARY_SUBPAGE_TOP_ROW_CLASS}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <h2 className={LIBRARY_ARTICLE_TITLE_CLASS}>{article.title}</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              disabled={setFavorite.isPending}
              onClick={() =>
                void setFavorite.mutateAsync({
                  articleSlug: article.slug,
                  isFavorite: !isFavorite,
                })
              }
            >
              <Star
                className={cn(
                  'size-6',
                  isFavorite && 'fill-primary text-primary',
                )}
                aria-hidden
              />
            </Button>
          </div>
          <BackToLibraryLink />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {article.tagIds.map((tagId) => (
            <Badge key={tagId} variant="secondary">
              {getTagLabel(tagId)}
            </Badge>
          ))}
        </div>
      </header>

      {article.body}
    </div>
  )
}

import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
        <Link
          to="/library"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to Library
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Article not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>There is no article with this address. Check the link or pick a topic from the Library index.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        to="/library"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to Library
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
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

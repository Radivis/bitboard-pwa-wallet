import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getArticle } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'

export const Route = createFileRoute('/library/articles/$slug')({
  component: LibraryArticlePage,
})

function LibraryArticlePage() {
  const { slug } = Route.useParams()
  const article = getArticle(slug)

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
        <h2 className="text-2xl font-bold tracking-tight">{article.title}</h2>
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

import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listArticles } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'

export const Route = createFileRoute('/library/')({
  component: LibraryIndexPage,
})

function LibraryIndexPage() {
  const articles = listArticles()

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <BookOpen className="h-8 w-8" aria-hidden />
        Library
      </h2>

      <p className="text-sm text-muted-foreground">
        In-app guides and reference material. Articles are fixed for accuracy; use the history view
        to retrace what you opened recently.
      </p>

      <div>
        <Link
          to="/library/history"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <History className="h-4 w-4 shrink-0" aria-hidden />
          Library history
        </Link>
      </div>

      <ul className="space-y-4">
        {articles.map((article) => (
          <li key={article.slug}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">
                  <Link
                    to="/library/articles/$slug"
                    params={{ slug: article.slug }}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {article.title}
                  </Link>
                </CardTitle>
                <CardDescription className="flex flex-wrap gap-1.5 pt-1">
                  {article.tagIds.map((tagId) => (
                    <Badge key={tagId} variant="secondary">
                      {getTagLabel(tagId)}
                    </Badge>
                  ))}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <Link
                  to="/library/articles/$slug"
                  params={{ slug: article.slug }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Read article
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}

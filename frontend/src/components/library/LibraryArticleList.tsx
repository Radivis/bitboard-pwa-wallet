import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { LibraryArticle } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'

interface LibraryArticleListProps {
  articles: LibraryArticle[]
  emptyMessage: string
}

export function LibraryArticleList({ articles, emptyMessage }: LibraryArticleListProps) {
  if (articles.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>
  }

  return (
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
  )
}

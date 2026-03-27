import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { List } from 'lucide-react'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { listArticlesSortedByTitle } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'

export const Route = createFileRoute('/library/')({
  component: LibraryIndexPage,
})

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function LibraryIndexPage() {
  const [query, setQuery] = useState('')
  const articles = useMemo(() => {
    const sorted = listArticlesSortedByTitle()
    const q = normalizeSearch(query)
    if (!q) return sorted
    return sorted.filter((article) => {
      if (article.title.toLowerCase().includes(q)) return true
      return article.tagIds.some((tagId) => getTagLabel(tagId).toLowerCase().includes(q))
    })
  }, [query])

  return (
    <div className="space-y-6">
      <PageHeader title="Library" icon={List} />

      <p className="text-sm text-muted-foreground">
        In-app guides and reference material. Articles are fixed for accuracy. Use the bottom bar to
        browse by tag, favorites, or history.
      </p>

      <div className="space-y-2">
        <label htmlFor="library-search" className="text-sm font-medium text-foreground">
          Search
        </label>
        <Input
          id="library-search"
          type="search"
          placeholder="Filter by title or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      <LibraryArticleList
        articles={articles}
        emptyMessage="No articles match your search. Try a different term."
      />
    </div>
  )
}

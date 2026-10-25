import { useMemo, useState } from 'react'
import { List } from 'lucide-react'
import { DesignCard, DesignCardContent } from '@/components/design/DesignCard'
import { DesignInput } from '@/components/design/DesignInput'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { PageHeader } from '@/components/PageHeader'
import { listArticlesSortedByTitle } from '@/lib/library/articles'
import { getTagLabel } from '@/lib/library/tags'

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

export function LibraryIndexPage() {
  const [query, setQuery] = useState('')
  const articles = useMemo(() => {
    const sorted = listArticlesSortedByTitle()
    const normalizedQuery = normalizeSearch(query)
    if (!normalizedQuery) return sorted
    return sorted.filter((article) => {
      if (article.title.toLowerCase().includes(normalizedQuery)) return true
      return article.tagIds.some((tagId) =>
        getTagLabel(tagId).toLowerCase().includes(normalizedQuery),
      )
    })
  }, [query])

  return (
    <div className="space-y-6">
      <PageHeader title="Library" icon={List} variant="area" />

      <p className="design-type-regular text-muted-foreground">
        In-app guides and reference material. Articles are fixed for accuracy. Use the bottom bar to
        browse by tag, favorites, or history.
      </p>

      <div className="space-y-2">
        <label htmlFor="library-search" className="design-type-emphasis text-foreground">
          Search
        </label>
        <DesignInput
          id="library-search"
          type="search"
          placeholder="Filter by title or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      <DesignCard>
        <DesignCardContent>
          <LibraryArticleList
            articles={articles}
            emptyMessage="No articles match your search. Try a different term."
          />
        </DesignCardContent>
      </DesignCard>
    </div>
  )
}

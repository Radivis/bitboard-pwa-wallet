import { createFileRoute, Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { LibraryPageHeader } from '@/components/library/LibraryPageHeader'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLibraryHistory } from '@/db'
import { articleSlugFromAccessPath, resolveHistoryPathLabel } from '@/lib/library/articles'

/** UI cap for the history list. DB pruning keeps at most `LIBRARY_HISTORY_MAX_ROWS` (see `library-history.ts`). */
const HISTORY_LIST_LIMIT = 100

export const Route = createFileRoute('/library/history')({
  component: LibraryHistoryPage,
})

function LibraryHistoryPage() {
  const { data: rows = [], error, isPending } = useLibraryHistory(HISTORY_LIST_LIMIT)
  const loadError =
    error instanceof Error ? error.message : error ? String(error) : null

  return (
    <div className="space-y-6">
      <LibraryPageHeader title="Library history" icon={History} />

      <p className="text-sm text-muted-foreground">
        Articles you opened recently (stored on this device only). Index, tags, and other library
        screens are not listed here.
      </p>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load history: {loadError}
        </p>
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No entries yet</CardTitle>
            <CardDescription>Open an article from the Library to build history.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const title = resolveHistoryPathLabel(row.access_path)
            const articleSlug = articleSlugFromAccessPath(row.access_path)
            return (
              <li key={row.library_history_id}>
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base font-medium">
                      {title && articleSlug ? (
                        <Link
                          to="/library/articles/$slug"
                          params={{ slug: articleSlug }}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {title}
                        </Link>
                      ) : row.access_path === '/library' || row.access_path === '/library/' ? (
                        <Link to="/library" className="text-primary underline-offset-4 hover:underline">
                          Library home
                        </Link>
                      ) : row.access_path === '/library/history' ? (
                        <span className="text-foreground">Library history (this page)</span>
                      ) : (
                        <span className="text-foreground">{row.access_path}</span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      <time dateTime={row.accessed_at}>
                        {new Date(row.accessed_at).toLocaleString()}
                      </time>
                      <span className="mt-1 block font-mono text-xs text-muted-foreground">
                        {row.access_path}
                      </span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

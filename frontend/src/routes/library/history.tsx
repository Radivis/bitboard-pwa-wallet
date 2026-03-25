import { useEffect, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, History } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getDatabase, listLibraryHistory } from '@/db'
import { articleSlugFromAccessPath, resolveHistoryPathLabel } from '@/lib/library/articles'

const HISTORY_LIST_LIMIT = 100

export const Route = createFileRoute('/library/history')({
  component: LibraryHistoryPage,
})

function LibraryHistoryPage() {
  const [rows, setRows] = useState<
    Array<{ library_history_id: number; accessed_at: string; access_path: string }>
  >([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listLibraryHistory(getDatabase(), HISTORY_LIST_LIMIT)
        if (!cancelled) setRows(list)
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <History className="h-8 w-8" aria-hidden />
          Library history
        </h2>
        <Link
          to="/library"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to Library
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Recent pages you opened in this section (stored on this device only).
      </p>

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          Could not load history: {loadError}
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No entries yet</CardTitle>
            <CardDescription>Open an article or this index from the Library to build history.</CardDescription>
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

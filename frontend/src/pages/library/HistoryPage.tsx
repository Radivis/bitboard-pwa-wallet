import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { History } from 'lucide-react'
import { DesignBanner } from '@/components/design/DesignBanner'
import {
  DesignCard,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { PageHeader } from '@/components/PageHeader'
import { useLibraryHistory } from '@/db'
import { articleSlugFromAccessPath, resolveHistoryPathLabel } from '@/lib/library/articles'

/** UI cap for the history list. DB pruning keeps at most `LIBRARY_HISTORY_MAX_ROWS` (see `library-history.ts`). */
const HISTORY_LIST_LIMIT = 100

const HISTORY_LINK_CLASS = 'min-w-0 text-primary underline-offset-4 hover:underline'

type HistoryEntry = {
  library_history_id: number
  accessed_at: string
  access_path: string
}

function HistoryEntryTitle({ accessPath }: { accessPath: string }) {
  const title = resolveHistoryPathLabel(accessPath)
  const articleSlug = articleSlugFromAccessPath(accessPath)
  if (title && articleSlug) {
    return (
      <Link
        to="/library/articles/$slug"
        params={{ slug: articleSlug }}
        className={HISTORY_LINK_CLASS}
      >
        {title}
      </Link>
    )
  }
  if (accessPath === '/library' || accessPath === '/library/') {
    return (
      <Link to="/library" className={HISTORY_LINK_CLASS}>
        Library home
      </Link>
    )
  }
  if (accessPath === '/library/history') {
    return <span>Library history (this page)</span>
  }
  return <span className="min-w-0 break-all">{accessPath}</span>
}

function HistoryEntryCard({ entry }: { entry: HistoryEntry }) {
  return (
    <DesignCard>
      <DesignCardHeader className="pb-6">
        <DesignCardTitle className="min-w-0 flex-wrap">
          <HistoryEntryTitle accessPath={entry.access_path} />
        </DesignCardTitle>
        <DesignCardDescription>
          <time dateTime={entry.accessed_at}>{new Date(entry.accessed_at).toLocaleString()}</time>
          <span className="design-type-addresses mt-1 block break-all">{entry.access_path}</span>
        </DesignCardDescription>
      </DesignCardHeader>
    </DesignCard>
  )
}

function HistoryEntries({ rows }: { rows: HistoryEntry[] }): ReactNode {
  if (rows.length === 0) {
    return (
      <DesignCard>
        <DesignCardHeader className="pb-6">
          <DesignCardTitle>No entries yet</DesignCardTitle>
          <DesignCardDescription>Open an article from the Library to build history.</DesignCardDescription>
        </DesignCardHeader>
      </DesignCard>
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map((entry) => (
        <li key={entry.library_history_id}>
          <HistoryEntryCard entry={entry} />
        </li>
      ))}
    </ul>
  )
}

export function HistoryPage() {
  const { data: rows = [], error, isPending } = useLibraryHistory(HISTORY_LIST_LIMIT)
  const loadError =
    error instanceof Error ? error.message : error ? String(error) : null

  return (
    <div className="space-y-6">
      <PageHeader title="Library history" icon={History} />

      <p className="design-type-regular text-muted-foreground">
        Articles you opened recently (stored on this device only). Index, tags, and other library
        screens are not listed here.
      </p>

      {loadError ? (
        <DesignBanner
          status="error"
          role="alert"
          title="Could not load history"
          description={loadError}
        />
      ) : isPending ? (
        <p className="design-type-regular text-muted-foreground">Loading…</p>
      ) : (
        <HistoryEntries rows={rows} />
      )}
    </div>
  )
}

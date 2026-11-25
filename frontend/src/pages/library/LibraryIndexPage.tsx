import { useMemo } from 'react'
import { List } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { LibraryFilterSort } from '@/components/library/LibraryFilterSort'
import { PageHeader } from '@/components/PageHeader'
import { useLibraryBookmarks } from '@/db'
import { listArticles } from '@/lib/library/articles'
import { applyLibraryFilterSort, libraryFilterEmptyMessage } from '@/lib/library/library-filter-sort'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

export function LibraryIndexPage() {
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))
  const { data: bookmarkSlugs, isLoading } = useLibraryBookmarks()
  const bookmarksAreLoading = criteria.scope === 'bookmarks' && isLoading
  const articles = useMemo(
    () => applyLibraryFilterSort(listArticles(), criteria, bookmarkSlugs),
    [criteria, bookmarkSlugs],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Library" icon={List} variant="area" />

      <p className="design-type-regular text-muted-foreground">
        In-app guides and reference material. Articles are fixed for accuracy. Choose Bookmarked on
        this page to see articles you bookmarked. Use the bottom bar to browse by tag or history.
      </p>

      <LibraryFilterSort />

      {bookmarksAreLoading ? (
        <p className="design-type-regular text-muted-foreground">Loading…</p>
      ) : (
        <LibraryArticleList
          articles={articles}
          surface="page"
          emptyMessage={libraryFilterEmptyMessage(criteria, bookmarkSlugs?.size ?? 0)}
        />
      )}
    </div>
  )
}

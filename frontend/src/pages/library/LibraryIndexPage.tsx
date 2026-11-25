import { useMemo } from 'react'
import { List } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DesignCard, DesignCardContent } from '@/components/design/DesignCard'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { LibraryFilterSort } from '@/components/library/LibraryFilterSort'
import { PageHeader } from '@/components/PageHeader'
import { listArticles } from '@/lib/library/articles'
import { applyLibraryFilterSort } from '@/lib/library/library-filter-sort'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

export function LibraryIndexPage() {
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))
  const articles = useMemo(
    () => applyLibraryFilterSort(listArticles(), criteria),
    [criteria],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Library" icon={List} variant="area" />

      <p className="design-type-regular text-muted-foreground">
        In-app guides and reference material. Articles are fixed for accuracy. Use the bottom bar to
        browse by tag, favorites, or history.
      </p>

      <LibraryFilterSort />

      <DesignCard>
        <DesignCardContent>
          <LibraryArticleList
            articles={articles}
            emptyMessage="No articles match the current filters."
          />
        </DesignCardContent>
      </DesignCard>
    </div>
  )
}

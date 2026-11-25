import { useMemo } from 'react'
import { Star } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { DesignCard, DesignCardContent } from '@/components/design/DesignCard'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { LibraryFilterSort } from '@/components/library/LibraryFilterSort'
import { PageHeader } from '@/components/PageHeader'
import { useLibraryFavorites } from '@/db'
import { listArticles } from '@/lib/library/articles'
import { applyLibraryFilterSort } from '@/lib/library/library-filter-sort'
import {
  selectLibraryFilterSortCriteria,
  useLibraryFilterSortStore,
} from '@/stores/libraryFilterSortStore'

export function FavoritesPage() {
  const { data: favoriteSlugs, isLoading } = useLibraryFavorites()
  const criteria = useLibraryFilterSortStore(useShallow(selectLibraryFilterSortCriteria))

  const favoritedArticles = useMemo(() => {
    if (!favoriteSlugs) return []
    return listArticles().filter((article) => favoriteSlugs.has(article.slug))
  }, [favoriteSlugs])
  const articles = useMemo(
    () => applyLibraryFilterSort(favoritedArticles, criteria),
    [favoritedArticles, criteria],
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Favorites" icon={Star} />

      <p className="design-type-regular text-muted-foreground">
        Articles you marked with the star. Favorites are stored on this device only.
      </p>

      <LibraryFilterSort />

      <DesignCard>
        <DesignCardContent>
          {isLoading ? (
            <p className="design-type-regular text-muted-foreground">Loading…</p>
          ) : (
            <LibraryArticleList
              articles={articles}
              emptyMessage={
                favoritedArticles.length === 0
                  ? 'No favorites yet. Open an article and tap the star to add one.'
                  : 'No favorites match the current filters.'
              }
            />
          )}
        </DesignCardContent>
      </DesignCard>
    </div>
  )
}

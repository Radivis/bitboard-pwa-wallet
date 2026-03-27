import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import {
  BackToLibraryLink,
  LIBRARY_SUBPAGE_TOP_ROW_CLASS,
} from '@/components/library/BackToLibraryLink'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { LibraryPageHeader } from '@/components/library/LibraryPageHeader'
import { useLibraryFavorites } from '@/db'
import { listArticlesSortedByTitle } from '@/lib/library/articles'

export const Route = createFileRoute('/library/favorites')({
  component: LibraryFavoritesPage,
})

function LibraryFavoritesPage() {
  const { data: favoriteSlugs, isLoading } = useLibraryFavorites()

  const articles = useMemo(() => {
    if (!favoriteSlugs) return []
    return listArticlesSortedByTitle().filter((a) => favoriteSlugs.has(a.slug))
  }, [favoriteSlugs])

  return (
    <div className="space-y-6">
      <div className={LIBRARY_SUBPAGE_TOP_ROW_CLASS}>
        <LibraryPageHeader title="Favorites" icon={Star} />
        <BackToLibraryLink />
      </div>

      <p className="text-sm text-muted-foreground">
        Articles you marked with the star. Favorites are stored on this device only.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <LibraryArticleList
          articles={articles}
          emptyMessage="No favorites yet. Open an article and tap the star to add one."
        />
      )}
    </div>
  )
}

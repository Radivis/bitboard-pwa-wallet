import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'
import { LibraryArticleList } from '@/components/library/LibraryArticleList'
import { useLibraryFavorites } from '@/db'
import { listArticles } from '@/lib/library/articles'

export const Route = createFileRoute('/library/favorites')({
  component: LibraryFavoritesPage,
})

function LibraryFavoritesPage() {
  const { data: favoriteSlugs, isLoading } = useLibraryFavorites()

  const articles = useMemo(() => {
    if (!favoriteSlugs) return []
    const all = listArticles()
    return all
      .filter((a) => favoriteSlugs.has(a.slug))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [favoriteSlugs])

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Star className="h-8 w-8" aria-hidden />
        Favorites
      </h2>

      <p className="text-sm text-muted-foreground">
        Articles you marked with the star. Favorites are stored on this device only.
      </p>

      <div>
        <Link
          to="/library"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Back to Library index
        </Link>
      </div>

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

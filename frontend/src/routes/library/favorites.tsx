import { useRef } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'

import { useLibraryFilterSortStore } from '@/stores/libraryFilterSortStore'

export const Route = createFileRoute('/library/favorites')({
  component: LibraryFavoritesRedirect,
})

function LibraryFavoritesRedirect() {
  const setScope = useLibraryFilterSortStore((state) => state.setScope)
  const didSelectFavorites = useRef(false)
  if (!didSelectFavorites.current) {
    didSelectFavorites.current = true
    setScope('favorites')
  }
  return <Navigate to="/library" replace />
}

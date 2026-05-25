import { createFileRoute } from '@tanstack/react-router'
import { FavoritesPage } from '@/pages/library/FavoritesPage'

export const Route = createFileRoute('/library/favorites')({
  component: FavoritesPage,
})

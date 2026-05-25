import { createFileRoute } from '@tanstack/react-router'
import { ArticlePage } from '@/pages/library/ArticlePage'

export const Route = createFileRoute('/library/articles/$slug')({
  component: ArticlePage,
})

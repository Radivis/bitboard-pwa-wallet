import { createFileRoute } from '@tanstack/react-router'
import { LibraryIndexPage } from '@/pages/library/LibraryIndexPage'

export const Route = createFileRoute('/library/')({
  component: LibraryIndexPage,
})

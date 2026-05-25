import { createFileRoute } from '@tanstack/react-router'
import { TagsPage } from '@/pages/library/TagsPage'
import { isLibraryTagId, type LibraryTagId } from '@/lib/library/tags'

export const Route = createFileRoute('/library/tags')({
  validateSearch: (search: Record<string, unknown>): { tag?: LibraryTagId } => {
    const raw = search.tag
    if (typeof raw !== 'string' || !isLibraryTagId(raw)) return {}
    return { tag: raw }
  },
  component: TagsPage,
})

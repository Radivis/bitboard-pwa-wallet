import { createFileRoute } from '@tanstack/react-router'
import { TagsPage } from '@/pages/library/TagsPage'
import { isLibraryTagId, type LibraryTagId } from '@/lib/library/tags'

export const Route = createFileRoute('/library/tags')({
  validateSearch: (search: Record<string, unknown>): { tag?: LibraryTagId } => {
    const tagFromSearch = search.tag
    if (typeof tagFromSearch !== 'string' || !isLibraryTagId(tagFromSearch)) {
      return {}
    }
    return { tag: tagFromSearch }
  },
  component: TagsPage,
})

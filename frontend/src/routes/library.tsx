import { useEffect } from 'react'
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { getDatabase, recordLibraryHistoryAccess } from '@/db'
import { articleSlugFromAccessPath, isArticleSlug } from '@/lib/library/articles'

export const Route = createFileRoute('/library')({
  component: LibraryLayout,
})

function LibraryLayout() {
  const location = useLocation()

  useEffect(() => {
    const pathname = location.pathname
    const slug = articleSlugFromAccessPath(pathname)
    if (!slug || !isArticleSlug(slug)) return
    void recordLibraryHistoryAccess(getDatabase(), pathname).catch((err) => {
      console.error('Failed to record library history:', err)
    })
  }, [location.pathname])

  return <Outlet />
}

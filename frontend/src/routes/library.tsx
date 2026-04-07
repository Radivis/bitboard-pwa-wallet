import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { getDatabase, libraryKeys, recordLibraryHistoryAccess } from '@/db'
import { articleSlugFromAccessPath, isArticleSlug } from '@/lib/library/articles'
import { PostLockPrivacyBanner } from '@/components/PostLockPrivacyBanner'

export const Route = createFileRoute('/library')({
  component: LibraryLayout,
})

function LibraryLayout() {
  const location = useLocation()
  const queryClient = useQueryClient()

  useEffect(() => {
    const pathname = location.pathname
    const slug = articleSlugFromAccessPath(pathname)
    if (!slug || !isArticleSlug(slug)) return
    void recordLibraryHistoryAccess(getDatabase(), pathname)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: libraryKeys.historyRoot })
      })
      .catch((err) => {
        console.error('Failed to record library history:', err)
      })
  }, [location.pathname, queryClient])

  return (
    <>
      <PostLockPrivacyBanner />
      <Outlet />
    </>
  )
}

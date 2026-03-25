import { useEffect } from 'react'
import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router'
import { getDatabase, recordLibraryHistoryAccess } from '@/db'

export const Route = createFileRoute('/library')({
  component: LibraryLayout,
})

function LibraryLayout() {
  const location = useLocation()

  useEffect(() => {
    const pathname = location.pathname
    if (!pathname.startsWith('/library')) return
    void recordLibraryHistoryAccess(getDatabase(), pathname).catch((err) => {
      console.error('Failed to record library history:', err)
    })
  }, [location.pathname])

  return <Outlet />
}

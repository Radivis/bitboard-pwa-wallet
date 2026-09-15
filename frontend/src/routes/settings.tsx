import { createFileRoute, Navigate, Outlet, useLocation, useSearch } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: 'data-backups' } => {
    const sectionFromSearch = search.section
    if (sectionFromSearch === 'data-backups') return { section: 'data-backups' }
    return {}
  },
  component: SettingsLayout,
})

function isSettingsRootPath(pathname: string): boolean {
  return pathname === '/settings' || pathname === '/settings/'
}

function SettingsLayout() {
  const { pathname } = useLocation()
  const { section } = useSearch({ from: '/settings' })

  // Do not `throw redirect()` here. After a slow parent load TanStack can
  // render status `redirected` without a load promise and `throw undefined`,
  // which blanks the app.
  if (section === 'data-backups' && isSettingsRootPath(pathname)) {
    return (
      <Navigate
        to="/settings/security"
        search={{ section: 'data-backups' }}
        replace
      />
    )
  }

  return <Outlet />
}

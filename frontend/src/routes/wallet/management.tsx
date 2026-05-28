import { createFileRoute } from '@tanstack/react-router'
import { ManagementPage } from '@/pages/wallet/ManagementPage'

export const Route = createFileRoute('/wallet/management')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { openDelete?: boolean } => {
    const openDeleteFromSearch = search.openDelete
    if (
      openDeleteFromSearch === true ||
      openDeleteFromSearch === 'true' ||
      openDeleteFromSearch === 1 ||
      openDeleteFromSearch === '1'
    ) {
      return { openDelete: true }
    }
    return {}
  },
  component: ManagementPage,
})

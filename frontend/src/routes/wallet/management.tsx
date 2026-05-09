import { createFileRoute } from '@tanstack/react-router'
import { ManagementPage } from '@/pages/wallet/ManagementPage'

export const Route = createFileRoute('/wallet/management')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { openDelete?: boolean } => {
    const raw = search.openDelete
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
      return { openDelete: true }
    }
    return {}
  },
  component: ManagementPage,
})

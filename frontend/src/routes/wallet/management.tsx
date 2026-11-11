import { createFileRoute } from '@tanstack/react-router'
import { ManagementPage } from '@/pages/wallet/ManagementPage'
import { parseManagementSearch } from '@/lib/wallet/management-search'

export const Route = createFileRoute('/wallet/management')({
  validateSearch: parseManagementSearch,
  component: ManagementPage,
})

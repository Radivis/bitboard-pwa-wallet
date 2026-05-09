import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/pages/wallet/DashboardPage'

export { DashboardPage } from '@/pages/wallet/DashboardPage'

export const Route = createFileRoute('/wallet/')({
  component: DashboardPage,
})

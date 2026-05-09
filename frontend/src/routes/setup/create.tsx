import { createFileRoute } from '@tanstack/react-router'
import { CreateWalletPage } from '@/pages/setup/CreateWalletPage'

export const Route = createFileRoute('/setup/create')({
  component: CreateWalletPage,
})

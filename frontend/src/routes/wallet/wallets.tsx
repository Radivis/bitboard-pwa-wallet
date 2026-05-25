import { createFileRoute } from '@tanstack/react-router'
import { WalletsPage } from '@/pages/wallet/WalletsPage'

export const Route = createFileRoute('/wallet/wallets')({
  component: WalletsPage,
})

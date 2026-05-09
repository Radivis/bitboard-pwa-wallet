import { createFileRoute } from '@tanstack/react-router'
import { ImportWalletPage } from '@/pages/setup/ImportWalletPage'

export const Route = createFileRoute('/setup/import')({
  component: ImportWalletPage,
})

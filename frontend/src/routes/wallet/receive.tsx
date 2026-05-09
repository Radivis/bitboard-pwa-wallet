import { createFileRoute } from '@tanstack/react-router'
import { ReceivePage } from '@/pages/wallet/ReceivePage'

export const Route = createFileRoute('/wallet/receive')({
  component: ReceivePage,
})

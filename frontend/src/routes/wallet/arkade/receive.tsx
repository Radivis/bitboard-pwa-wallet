import { createFileRoute } from '@tanstack/react-router'
import { ArkadeReceivePage } from '@/pages/wallet/ArkadeReceivePage'

export const Route = createFileRoute('/wallet/arkade/receive')({
  component: ArkadeReceivePage,
})

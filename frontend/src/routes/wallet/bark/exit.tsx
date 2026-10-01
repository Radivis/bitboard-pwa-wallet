import { createFileRoute } from '@tanstack/react-router'
import { BarkExitPage } from '@/pages/wallet/BarkExitPage'

export const Route = createFileRoute('/wallet/bark/exit')({
  component: BarkExitPage,
})

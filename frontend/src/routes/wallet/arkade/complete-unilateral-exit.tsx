import { createFileRoute } from '@tanstack/react-router'
import { CompleteUnilateralExitPage } from '@/pages/wallet/CompleteUnilateralExitPage'

export const Route = createFileRoute('/wallet/arkade/complete-unilateral-exit')({
  component: CompleteUnilateralExitPage,
})

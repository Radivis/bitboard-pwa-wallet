import { createFileRoute } from '@tanstack/react-router'
import { UnilateralExitControlPage } from '@/pages/wallet/UnilateralExitControlPage'

export const Route = createFileRoute('/wallet/arkade/unilateral-exit')({
  component: UnilateralExitControlPage,
})

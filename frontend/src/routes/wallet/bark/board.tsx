import { createFileRoute } from '@tanstack/react-router'
import { BarkBoardPage } from '@/pages/wallet/BarkBoardPage'

export const Route = createFileRoute('/wallet/bark/board')({
  component: BarkBoardPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { ArkadeBoardPage } from '@/pages/wallet/ArkadeBoardPage'

export const Route = createFileRoute('/wallet/arkade/board')({
  component: ArkadeBoardPage,
})

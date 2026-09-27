import { createFileRoute } from '@tanstack/react-router'
import { CollaborativeExitPage } from '@/pages/wallet/CollaborativeExitPage'

export const Route = createFileRoute('/wallet/arkade/collaborative-exit')({
  component: CollaborativeExitPage,
})

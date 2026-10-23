import { createFileRoute } from '@tanstack/react-router'
import { BarkOffboardPage } from '@/pages/wallet/BarkOffboardPage'

export const Route = createFileRoute('/wallet/bark/offboard')({
  component: BarkOffboardPage,
})

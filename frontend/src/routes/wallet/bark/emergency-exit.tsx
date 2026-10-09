import { createFileRoute } from '@tanstack/react-router'
import { BarkEmergencyExitPage } from '@/pages/wallet/BarkEmergencyExitPage'

export const Route = createFileRoute('/wallet/bark/emergency-exit')({
  component: BarkEmergencyExitPage,
})

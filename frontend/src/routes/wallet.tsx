import { createFileRoute } from '@tanstack/react-router'
import { WalletRouteSecretsGate } from '@/components/WalletRouteSecretsGate'

export const Route = createFileRoute('/wallet')({
  component: WalletRouteSecretsGate,
})

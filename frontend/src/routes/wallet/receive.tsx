import { createFileRoute } from '@tanstack/react-router'
import { ReceivePage } from '@/pages/wallet/ReceivePage'

type ReceiveSearch = {
  mode?: 'arkade'
}

export const Route = createFileRoute('/wallet/receive')({
  validateSearch: (search: Record<string, unknown>): ReceiveSearch => ({
    mode: search.mode === 'arkade' ? 'arkade' : undefined,
  }),
  component: ReceivePage,
})

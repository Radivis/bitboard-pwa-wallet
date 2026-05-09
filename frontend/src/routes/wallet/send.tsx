import { createFileRoute } from '@tanstack/react-router'
import { SendPage } from '@/pages/wallet/SendPage'

export { SendPage, SendFlow } from '@/pages/wallet/SendPage'

export const Route = createFileRoute('/wallet/send')({
  component: SendPage,
})

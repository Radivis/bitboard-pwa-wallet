import { createFileRoute } from '@tanstack/react-router'
import { ArkadeSendPage } from '@/pages/wallet/ArkadeSendPage'

export const Route = createFileRoute('/wallet/arkade/send')({
  component: ArkadeSendPage,
})

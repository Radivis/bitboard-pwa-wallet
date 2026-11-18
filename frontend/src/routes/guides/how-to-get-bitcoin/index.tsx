import { createFileRoute } from '@tanstack/react-router'
import { HowToGetBitcoinPage } from '@/pages/guides/HowToGetBitcoinPage'

export const Route = createFileRoute('/guides/how-to-get-bitcoin/')({
  component: HowToGetBitcoinPage,
})

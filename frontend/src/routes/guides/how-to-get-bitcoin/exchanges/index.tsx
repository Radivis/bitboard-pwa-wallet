import { createFileRoute } from '@tanstack/react-router'
import { ExchangeGuideIntroPage } from '@/pages/guides/ExchangeGuideIntroPage'

export const Route = createFileRoute('/guides/how-to-get-bitcoin/exchanges/')({
  component: ExchangeGuideIntroPage,
})

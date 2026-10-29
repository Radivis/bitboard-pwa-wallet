import { createFileRoute } from '@tanstack/react-router'
import { GuidesIntroductionPage } from '@/pages/guides/GuidesIntroductionPage'

export const Route = createFileRoute('/guides/introduction/')({
  component: GuidesIntroductionPage,
})

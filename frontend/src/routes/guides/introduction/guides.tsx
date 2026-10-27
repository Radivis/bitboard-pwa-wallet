import { createFileRoute } from '@tanstack/react-router'
import { GuideAreaIntroduction } from '@/pages/guides/GuideAreaIntroductionPage'

export const Route = createFileRoute('/guides/introduction/guides')({
  component: GuidesAreaIntroductionRoute,
})

function GuidesAreaIntroductionRoute() {
  return <GuideAreaIntroduction area="guides" />
}

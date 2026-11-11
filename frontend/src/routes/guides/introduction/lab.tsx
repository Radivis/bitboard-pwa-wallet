import { createFileRoute } from '@tanstack/react-router'
import { GuideAreaIntroduction } from '@/pages/guides/GuideAreaIntroductionPage'

export const Route = createFileRoute('/guides/introduction/lab')({
  component: LabAreaIntroductionRoute,
})

function LabAreaIntroductionRoute() {
  return <GuideAreaIntroduction area="lab" />
}

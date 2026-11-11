import { createFileRoute } from '@tanstack/react-router'
import { GuideAreaIntroduction } from '@/pages/guides/GuideAreaIntroductionPage'

export const Route = createFileRoute('/guides/introduction/settings')({
  component: SettingsAreaIntroductionRoute,
})

function SettingsAreaIntroductionRoute() {
  return <GuideAreaIntroduction area="settings" />
}

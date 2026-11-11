import { createFileRoute } from '@tanstack/react-router'
import { GuideAreaIntroduction } from '@/pages/guides/GuideAreaIntroductionPage'

export const Route = createFileRoute('/guides/introduction/library')({
  component: LibraryAreaIntroductionRoute,
})

function LibraryAreaIntroductionRoute() {
  return <GuideAreaIntroduction area="library" />
}

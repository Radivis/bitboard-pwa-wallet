import { createFileRoute } from '@tanstack/react-router'
import { GuideAreaIntroduction } from '@/pages/guides/GuideAreaIntroductionPage'

export const Route = createFileRoute('/guides/introduction/wallet')({
  component: WalletAreaIntroductionRoute,
})

function WalletAreaIntroductionRoute() {
  return <GuideAreaIntroduction area="wallet" />
}

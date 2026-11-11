import { createFileRoute, Navigate } from '@tanstack/react-router'
import { ExchangeGuideStepPage } from '@/pages/guides/ExchangeGuideStepPage'
import { parseExchangeGuideStep } from '@/pages/guides/exchange-guide'

export const Route = createFileRoute('/guides/how-to-get-bitcoin/exchanges/$step')({
  component: ExchangeGuideStepRoute,
})

function ExchangeGuideStepRoute() {
  const { step } = Route.useParams()
  const stepNumber = parseExchangeGuideStep(step)
  if (stepNumber === null) {
    return (
      <Navigate to="/guides/how-to-get-bitcoin/exchanges/$step" params={{ step: '1' }} replace />
    )
  }
  return <ExchangeGuideStepPage step={stepNumber} />
}

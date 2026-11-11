import { Link } from '@tanstack/react-router'
import { DesignButton } from '@/components/design/DesignButton'
import { PageHeader } from '@/components/PageHeader'

type BarkRailBackLink = '/wallet' | '/wallet/management'

export function BarkRailUnavailable({
  title,
  message,
  backTo,
  backLabel,
  testId,
}: {
  title: string
  message: string
  backTo: BarkRailBackLink
  backLabel: string
  testId?: string
}) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <p className="text-muted-foreground" data-testid={testId}>
        {message}
      </p>
      <DesignButton type="button" appearance="secondary" asChild>
        <Link to={backTo}>{backLabel}</Link>
      </DesignButton>
    </div>
  )
}

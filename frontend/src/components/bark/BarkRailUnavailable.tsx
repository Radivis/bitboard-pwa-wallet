import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'

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
      <Button type="button" variant="outline" asChild>
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  )
}

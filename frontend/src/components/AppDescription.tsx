import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { cn } from '@/lib/shared/utils'

interface AppDescriptionProps {
  className?: string
}

/**
 * Shared tagline with infomode explanations for key terms. Used on setup welcome and settings About.
 */
export function AppDescription({ className }: AppDescriptionProps) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      The interactive {' '}
      <InfomodeWrapper
        as="span"
        infoId="app-description-bitcoin"
        infoTitle="Bitcoin"
        infoText="A global, open network for sending value online without a middleman. “Bitcoin” can mean the network people use to move money peer-to-peer, or the units of value tracked on that network—often described as digital money you truly own."
      >
        Bitcoin
      </InfomodeWrapper>{' '}
      learning app.
    </p>
  )
}

import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { cn } from '@/lib/utils'

interface AppDescriptionProps {
  className?: string
}

/**
 * Shared tagline with infomode explanations for key terms. Used on setup welcome and settings About.
 */
export function AppDescription({ className }: AppDescriptionProps) {
  return (
    <p className={cn('text-muted-foreground', className)}>
      A{' '}
      <InfomodeWrapper
        as="span"
        infoId="app-description-self-custody"
        infoTitle="Self-custody"
        infoText="You—not a bank or company—control the keys that spend your money. That means more freedom, but also more responsibility: if you lose your backup words, nobody can press a “reset password” button for you. Keep your recovery phrase safe and private."
      >
        self-custody
      </InfomodeWrapper>{' '}
      <InfomodeWrapper
        as="span"
        infoId="app-description-bitcoin"
        infoTitle="Bitcoin"
        infoText="A global, open network for sending value online without a middleman. “Bitcoin” can mean the network people use to move money peer-to-peer, or the units of value tracked on that network—often described as digital money you truly own."
      >
        Bitcoin
      </InfomodeWrapper>{' '}
      <InfomodeWrapper
        as="span"
        infoId="app-description-wallet"
        infoTitle="Wallet (the app)"
        infoText="Here, “wallet” means software like Bitboard that stores your secret keys and helps you receive, hold, and send Bitcoin. It does not stuff coins into one folder on your phone—the shared ledger records balances; your wallet proves you control yours."
      >
        wallet
      </InfomodeWrapper>{' '}
      in your browser and mobile device.
    </p>
  )
}

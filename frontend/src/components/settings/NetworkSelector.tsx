import { NETWORK_LABELS, type NetworkMode } from '@/stores/walletStore'
import { useNetworkModeSelection } from '@/hooks/useNetworkModeSelection'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignButton } from '@/components/design/DesignButton'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/shared/utils'

const NETWORK_OPTIONS: NetworkMode[] = [
  'mainnet',
  'testnet',
  'signet',
  'regtest',
  'lab',
]

const NETWORK_INFOMODE: Record<NetworkMode, { title: string; text: string }> = {
  mainnet: {
    title: 'Mainnet',
    text: 'The live Bitcoin network where real BTC moves. Use mainnet when you are sending or receiving money that has real economic value.',
  },
  testnet: {
    title: 'Testnet',
    text: 'A public testing network that behaves like Bitcoin but uses free test coins from faucets. Ideal for trying the app without risking real funds.',
  },
  signet: {
    title: 'Signet',
    text: 'Default Esplora uses Mutinynet (a fast custom signet widely used for Lightning testing). Coins are not real money. Point Esplora at another Signet if your on-chain wallet should follow a different signet.',
  },
  regtest: {
    title: 'Regtest',
    text: '“Regression test” mode: usually a private or local chain developers run for automated tests and experiments. Not the same as the public internet Bitcoin networks most users pick.',
  },
  lab: {
    title: 'Lab',
    text: 'Bitboard’s in-app simulator: a fake blockchain that runs inside your browser for safe practice—mine blocks, try transactions, and learn without touching mainnet or public testnets.',
  },
}

export function NetworkSelector() {
  const {
    displayNetworkMode,
    regtestEnabled,
    mainnetSelectionBlocked,
    isSwitching,
    statusLine,
    selectNetwork,
    unlockDialog,
  } = useNetworkModeSelection()

  const networkOptionsVisible: NetworkMode[] = regtestEnabled
    ? NETWORK_OPTIONS
    : NETWORK_OPTIONS.filter((network) => network !== 'regtest')

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {networkOptionsVisible.map((network) => {
          const { title, text } = NETWORK_INFOMODE[network]
          const isMainnetBlocked = network === 'mainnet' && mainnetSelectionBlocked
          return (
            <InfomodeWrapper
              key={network}
              infoId={`settings-network-mode-${network}`}
              infoTitle={title}
              infoText={text}
            >
              <DesignButton
                appearance={displayNetworkMode === network ? 'primary' : 'secondary'}
                onClick={() => selectNetwork(network)}
                disabled={isSwitching}
                aria-disabled={isMainnetBlocked || undefined}
                className={cn(
                  isMainnetBlocked &&
                    'cursor-not-allowed opacity-60 hover:bg-transparent',
                )}
              >
                {NETWORK_LABELS[network]}
              </DesignButton>
            </InfomodeWrapper>
          )
        })}
      </div>
      {isSwitching && statusLine && (
        <LoadingSpinner
          text={statusLine}
          className="flex-row items-start justify-start gap-2 py-1 [&_.animate-spin]:mt-0.5 [&_.animate-spin]:h-4 [&_.animate-spin]:w-4 [&_p]:max-w-[min(100%,28rem)] [&_p]:text-left [&_p]:leading-snug"
        />
      )}

      {unlockDialog}
    </div>
  )
}

import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  useWalletStore,
  NETWORK_LABELS,
  selectCommittedNetworkMode,
  type NetworkMode,
} from '@/stores/walletStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useDescriptorWalletSwitchMutation } from '@/hooks/useDescriptorWalletSwitchMutation'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { cn } from '@/lib/shared/utils'
import { useRequireUnlockedWallet } from '@/hooks/useRequireUnlockedWallet'

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
  const displayNetworkMode = useWalletStore(selectCommittedNetworkMode)
  const isMainnetAccessEnabled = useFeatureStore((featureState) => featureState.isMainnetAccessEnabled)
  const isRegtestModeEnabled = useFeatureStore((featureState) => featureState.isRegtestModeEnabled)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const { runWhenUnlocked, unlockDialog } = useRequireUnlockedWallet()

  const mainnetSelectionBlocked =
    !isMainnetAccessEnabled && displayNetworkMode !== 'mainnet'

  const networkOptionsVisible: NetworkMode[] = isRegtestModeEnabled
    ? NETWORK_OPTIONS
    : NETWORK_OPTIONS.filter((n) => n !== 'regtest')

  const { mutate: switchMutate, isSwitching, statusLine } =
    useDescriptorWalletSwitchMutation('network')

  const handleNetworkChange = useCallback(
    (network: NetworkMode) => {
      if (network === displayNetworkMode) return

      if (activeWalletId !== null) {
        runWhenUnlocked(() => switchMutate(network))
        return
      }

      switchMutate(network)
    },
    [displayNetworkMode, activeWalletId, switchMutate, runWhenUnlocked],
  )

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
              <Button
                variant={displayNetworkMode === network ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (isMainnetBlocked) {
                    toast.info(
                      'Activate Mainnet access in Settings → Features before selecting Mainnet.',
                    )
                    return
                  }
                  handleNetworkChange(network)
                }}
                disabled={isSwitching}
                aria-disabled={isMainnetBlocked || undefined}
                className={cn(
                  isMainnetBlocked &&
                    'cursor-not-allowed opacity-60 hover:bg-transparent',
                )}
              >
                {NETWORK_LABELS[network]}
              </Button>
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

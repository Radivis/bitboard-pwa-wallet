import { useState, useCallback, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useWalletStore,
  NETWORK_LABELS,
  selectCommittedNetworkMode,
  type NetworkMode,
} from '@/stores/walletStore'
import { useSubWalletSwitchMutation } from '@/hooks/useSubWalletSwitchMutation'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useSessionStore } from '@/stores/sessionStore'
import { LoadingSpinner } from '@/components/LoadingSpinner'

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
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const sessionPassword = useSessionStore((s) => s.password)
  const [showUnlockForNetworkChange, setShowUnlockForNetworkChange] =
    useState(false)
  const pendingNetworkAfterUnlockRef = useRef<NetworkMode | null>(null)

  const { mutate: switchMutate, loading, statusLine } =
    useSubWalletSwitchMutation('network')

  const handleNetworkChange = useCallback(
    (network: NetworkMode) => {
      if (network === displayNetworkMode) return

      if (activeWalletId !== null && sessionPassword === null) {
        pendingNetworkAfterUnlockRef.current = network
        setShowUnlockForNetworkChange(true)
        return
      }

      switchMutate(network)
    },
    [displayNetworkMode, activeWalletId, sessionPassword, switchMutate],
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {NETWORK_OPTIONS.map((network) => {
          const { title, text } = NETWORK_INFOMODE[network]
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
                onClick={() => handleNetworkChange(network)}
                disabled={loading}
              >
                {NETWORK_LABELS[network]}
              </Button>
            </InfomodeWrapper>
          )
        })}
      </div>
      {loading && statusLine && (
        <LoadingSpinner
          text={statusLine}
          className="flex-row items-start justify-start gap-2 py-1 [&_.animate-spin]:mt-0.5 [&_.animate-spin]:h-4 [&_.animate-spin]:w-4 [&_p]:max-w-[min(100%,28rem)] [&_p]:text-left [&_p]:leading-snug"
        />
      )}
      {displayNetworkMode === 'lab' && (
        <div>
          <InfomodeWrapper
            infoId="settings-network-manage-lab"
            infoTitle="Manage lab"
            infoText="Opens Bitboard’s lab screen where you can mine pretend blocks, inspect addresses and UTXOs, and build practice transactions inside the simulator—still disconnected from real Bitcoin networks."
          >
            <Link to="/lab" preload={false}>
              <Button variant="outline" size="sm" disabled={loading}>
                Manage lab
              </Button>
            </Link>
          </InfomodeWrapper>
        </div>
      )}

      {showUnlockForNetworkChange && (
        <WalletUnlock
          onDismiss={() => {
            pendingNetworkAfterUnlockRef.current = null
            setShowUnlockForNetworkChange(false)
          }}
          onUnlockSuccess={() => {
            const target = pendingNetworkAfterUnlockRef.current
            pendingNetworkAfterUnlockRef.current = null
            setShowUnlockForNetworkChange(false)
            if (target) switchMutate(target)
          }}
        />
      )}
    </div>
  )
}

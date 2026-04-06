import { useState, useCallback, useRef, useMemo } from 'react'
import { useMutation, useIsFetching } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  useWalletStore,
  NETWORK_LABELS,
  type AddressType,
  type NetworkMode,
  type WalletStatus,
} from '@/stores/walletStore'
import { walletIsUnlockedOrSyncing } from '@/lib/wallet-unlocked-status'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'
import { terminateLabWorker } from '@/workers/lab-factory'
import { switchToLabNetwork } from '@/lib/switch-to-lab-network'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { WalletUnlock } from '@/components/WalletUnlock'
import { useSessionStore } from '@/stores/sessionStore'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ACTIVE_WALLET_LOAD_QUERY_ROOT } from '@/lib/wallet-load-query-keys'

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

async function switchDescriptorWalletWhileUnlockedOrSyncing(params: {
  targetNetwork: NetworkMode
  previousNetwork: NetworkMode
  addressType: AddressType
  accountId: number
  afterDescriptorSwitch?: () => void | Promise<void>
}): Promise<void> {
  const {
    targetNetwork,
    previousNetwork,
    addressType,
    accountId,
    afterDescriptorSwitch,
  } = params
  await switchDescriptorWallet({
    targetNetworkMode: targetNetwork,
    targetAddressType: addressType,
    targetAccountId: accountId,
    currentNetworkMode: previousNetwork,
    currentAddressType: addressType,
    currentAccountId: accountId,
  })
  await afterDescriptorSwitch?.()
}

async function switchFromLabNetwork(params: {
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const {
    setNetworkMode,
    targetNetwork,
    walletStatus,
    addressType,
    accountId,
  } = params
  if (walletIsUnlockedOrSyncing(walletStatus)) {
    await switchDescriptorWalletWhileUnlockedOrSyncing({
      targetNetwork,
      previousNetwork: 'lab',
      addressType,
      accountId,
      afterDescriptorSwitch: () => {
        terminateLabWorker()
      },
    })
    return
  }

  terminateLabWorker()
  setNetworkMode(targetNetwork)
}

async function switchBetweenLiveNetworks(params: {
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  previousNetwork: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const {
    setNetworkMode,
    targetNetwork,
    previousNetwork,
    walletStatus,
    addressType,
    accountId,
  } = params
  if (!walletIsUnlockedOrSyncing(walletStatus)) {
    setNetworkMode(targetNetwork)
    return
  }

  await switchDescriptorWalletWhileUnlockedOrSyncing({
    targetNetwork,
    previousNetwork,
    addressType,
    accountId,
  })
}

function committedNetworkMode(): NetworkMode {
  const { loadedSubWallet, networkMode } = useWalletStore.getState()
  return loadedSubWallet?.networkMode ?? networkMode
}

export function NetworkSelector() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const loadedSubWallet = useWalletStore((s) => s.loadedSubWallet)
  const setNetworkMode = useWalletStore((s) => s.setNetworkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const sessionPassword = useSessionStore((s) => s.password)
  const [showUnlockForNetworkChange, setShowUnlockForNetworkChange] =
    useState(false)
  const pendingNetworkAfterUnlockRef = useRef<NetworkMode | null>(null)

  const displayNetworkMode = loadedSubWallet?.networkMode ?? networkMode

  const bootstrapFetching =
    useIsFetching({ queryKey: [ACTIVE_WALLET_LOAD_QUERY_ROOT] }) > 0

  const runNetworkChange = useCallback(async (network: NetworkMode) => {
    const currentMode = committedNetworkMode()
    const walletStatus = useWalletStore.getState().walletStatus
    const addressType = useWalletStore.getState().addressType
    const accountId = useWalletStore.getState().accountId

    if (network === currentMode) return
    const previousNetworkMode = currentMode

    if (network === 'lab') {
      await switchToLabNetwork({
        previousNetworkMode,
        walletStatus,
        addressType,
        accountId,
      })
      return
    }

    if (previousNetworkMode === 'lab') {
      await switchFromLabNetwork({
        setNetworkMode,
        targetNetwork: network,
        walletStatus,
        addressType,
        accountId,
      })
      return
    }

    await switchBetweenLiveNetworks({
      setNetworkMode,
      targetNetwork: network,
      previousNetwork: previousNetworkMode,
      walletStatus,
      addressType,
      accountId,
    })
  }, [setNetworkMode])

  const switchMutation = useMutation({
    mutationFn: runNetworkChange,
  })

  const handleNetworkChange = useCallback(
    (network: NetworkMode) => {
      if (network === displayNetworkMode) return

      if (activeWalletId !== null && sessionPassword === null) {
        pendingNetworkAfterUnlockRef.current = network
        setShowUnlockForNetworkChange(true)
        return
      }

      switchMutation.mutate(network)
    },
    [displayNetworkMode, activeWalletId, sessionPassword, switchMutation],
  )

  const pendingSwitch = switchMutation.isPending
  const loading = bootstrapFetching || pendingSwitch

  const statusLine = useMemo(() => {
    if (bootstrapFetching) return 'Loading wallet…'
    if (pendingSwitch) return 'Switching network…'
    return null
  }, [bootstrapFetching, pendingSwitch])

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
          className="flex-row items-center justify-start gap-2 py-1 [&_.animate-spin]:h-4 [&_.animate-spin]:w-4"
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
            if (target) switchMutation.mutate(target)
          }}
        />
      )}
    </div>
  )
}

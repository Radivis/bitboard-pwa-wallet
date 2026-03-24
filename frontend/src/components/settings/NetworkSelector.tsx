import { useState, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  useWalletStore,
  NETWORK_LABELS,
  type AddressType,
  type NetworkMode,
  type WalletStatus,
} from '@/stores/walletStore'
import { updateDescriptorWalletChangeset } from '@/lib/descriptor-wallet-manager'
import { loadDescriptorWalletWithoutSync } from '@/lib/wallet-utils'
import { toBitcoinNetwork } from '@/lib/bitcoin-utils'
import { switchDescriptorWallet } from '@/lib/settings-switch-wallet'
import { terminateLabWorker } from '@/workers/lab-factory'
import { appQueryClient } from '@/lib/app-query-client'
import { prefetchLabChainState } from '@/hooks/useLabChainStateQuery'
import { useSessionStore } from '@/stores/sessionStore'
import { useCryptoStore } from '@/stores/cryptoStore'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'

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
    text: 'A coordinated signet network for testing—often used by wallets and services that want a stable test environment. Coins are not real money.',
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

function walletIsUnlockedOrSyncing(walletStatus: WalletStatus): boolean {
  return walletStatus === 'unlocked' || walletStatus === 'syncing'
}

/**
 * When switching *to* lab with an active WASM wallet: persist the current
 * network’s descriptor wallet state to storage, then load the lab wallet in
 * memory without starting sync. Skipped when there is no session password /
 * active wallet, or when export/update fails (e.g. wallet not initialized yet).
 */
async function persistAndLoadLabWalletIfUnlockedOrSyncing(params: {
  walletStatus: WalletStatus
  previousNetworkMode: NetworkMode
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const { walletStatus, previousNetworkMode, addressType, accountId } = params
  if (!walletIsUnlockedOrSyncing(walletStatus)) return

  const sessionPassword = useSessionStore.getState().password
  const activeWalletId = useWalletStore.getState().activeWalletId
  if (!sessionPassword || !activeWalletId) return

  const { exportChangeset } = useCryptoStore.getState()
  try {
    const currentChangeset = await exportChangeset()
    await updateDescriptorWalletChangeset({
      password: sessionPassword,
      walletId: activeWalletId,
      network: toBitcoinNetwork(previousNetworkMode),
      addressType,
      accountId,
      changesetJson: currentChangeset,
    })
  } catch {
    // No active WASM wallet yet (e.g., first load) -- safe to skip
  }

  await loadDescriptorWalletWithoutSync({
    password: sessionPassword,
    walletId: activeWalletId,
    networkMode: 'lab',
    addressType,
    accountId,
  })
}

/**
 * User selected lab: tear down any lab worker, optionally sync wallet state
 * into lab mode, warm chain state for queries, then set network to lab.
 */
async function switchToLabNetwork(params: {
  setSwitching: (value: boolean) => void
  setNetworkMode: (mode: NetworkMode) => void
  previousNetworkMode: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const {
    setSwitching,
    setNetworkMode,
    previousNetworkMode,
    walletStatus,
    addressType,
    accountId,
  } = params
  setSwitching(true)
  try {
    terminateLabWorker()
    await persistAndLoadLabWalletIfUnlockedOrSyncing({
      walletStatus,
      previousNetworkMode,
      addressType,
      accountId,
    })
    await prefetchLabChainState(appQueryClient)
    setNetworkMode('lab')
  } catch (err) {
    toast.error(errorMessage(err) || 'Failed to start lab')
  } finally {
    setSwitching(false)
  }
}

/**
 * Move the descriptor wallet from `previousNetwork` to `targetNetwork` with a
 * loading overlay; runs optional work after the WASM switch succeeds (e.g.
 * stopping the lab worker when leaving lab).
 */
async function switchDescriptorWalletWhileUnlockedOrSyncing(params: {
  setSwitching: (value: boolean) => void
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  previousNetwork: NetworkMode
  addressType: AddressType
  accountId: number
  afterDescriptorSwitch?: () => void | Promise<void>
}): Promise<void> {
  const {
    setSwitching,
    setNetworkMode,
    targetNetwork,
    previousNetwork,
    addressType,
    accountId,
    afterDescriptorSwitch,
  } = params
  setSwitching(true)
  try {
    await switchDescriptorWallet({
      targetNetworkMode: targetNetwork,
      targetAddressType: addressType,
      targetAccountId: accountId,
      currentNetworkMode: previousNetwork,
      currentAddressType: addressType,
      currentAccountId: accountId,
    })
    await afterDescriptorSwitch?.()
    setNetworkMode(targetNetwork)
  } catch {
    // switchDescriptorWallet already showed a toast
  } finally {
    setSwitching(false)
  }
}

/**
 * Leaving lab: if the wallet is active, switch the descriptor wallet back to a
 * live chain (with spinner); always stop the lab worker before/after as
 * appropriate. If the wallet is not active, just tear down lab and update mode.
 */
async function switchFromLabNetwork(params: {
  setSwitching: (value: boolean) => void
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const {
    setSwitching,
    setNetworkMode,
    targetNetwork,
    walletStatus,
    addressType,
    accountId,
  } = params
  if (walletIsUnlockedOrSyncing(walletStatus)) {
    await switchDescriptorWalletWhileUnlockedOrSyncing({
      setSwitching,
      setNetworkMode,
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

/**
 * Switch between non-lab networks: descriptor switch when the wallet is active,
 * otherwise only update persisted network mode.
 */
async function switchBetweenLiveNetworks(params: {
  setSwitching: (value: boolean) => void
  setNetworkMode: (mode: NetworkMode) => void
  targetNetwork: NetworkMode
  previousNetwork: NetworkMode
  walletStatus: WalletStatus
  addressType: AddressType
  accountId: number
}): Promise<void> {
  const {
    setSwitching,
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
    setSwitching,
    setNetworkMode,
    targetNetwork,
    previousNetwork,
    addressType,
    accountId,
  })
}

export function NetworkSelector() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const setNetworkMode = useWalletStore((s) => s.setNetworkMode)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const addressType = useWalletStore((s) => s.addressType)
  const accountId = useWalletStore((s) => s.accountId)
  const [switching, setSwitching] = useState(false)

  const handleNetworkChange = useCallback(
    async (network: NetworkMode) => {
      if (network === networkMode) return
      const previousNetworkMode = networkMode

      if (network === 'lab') {
        await switchToLabNetwork({
          setSwitching,
          setNetworkMode,
          previousNetworkMode,
          walletStatus,
          addressType,
          accountId,
        })
        return
      }

      if (previousNetworkMode === 'lab') {
        await switchFromLabNetwork({
          setSwitching,
          setNetworkMode,
          targetNetwork: network,
          walletStatus,
          addressType,
          accountId,
        })
        return
      }

      await switchBetweenLiveNetworks({
        setSwitching,
        setNetworkMode,
        targetNetwork: network,
        previousNetwork: previousNetworkMode,
        walletStatus,
        addressType,
        accountId,
      })
    },
    [networkMode, setNetworkMode, walletStatus, addressType, accountId],
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
                variant={networkMode === network ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleNetworkChange(network)}
                disabled={switching}
              >
                {NETWORK_LABELS[network]}
              </Button>
            </InfomodeWrapper>
          )
        })}
      </div>
      {networkMode === 'lab' && (
        <div>
          <InfomodeWrapper
            infoId="settings-network-manage-lab"
            infoTitle="Manage lab"
            infoText="Opens Bitboard’s lab screen where you can mine pretend blocks, inspect addresses and UTXOs, and build practice transactions inside the simulator—still disconnected from real Bitcoin networks."
          >
            <Link to="/lab">
              <Button variant="outline" size="sm">
                Manage lab
              </Button>
            </Link>
          </InfomodeWrapper>
        </div>
      )}
    </div>
  )
}

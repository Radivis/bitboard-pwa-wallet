import { useState, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  useWalletStore,
  NETWORK_LABELS,
  type NetworkMode,
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
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils'

const NETWORK_OPTIONS: NetworkMode[] = [
  'mainnet',
  'testnet',
  'signet',
  'regtest',
  'lab',
]

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
        setSwitching(true)
        try {
          terminateLabWorker()
          if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
            const sessionPassword = useSessionStore.getState().password
            const activeWalletId = useWalletStore.getState().activeWalletId
            if (sessionPassword && activeWalletId) {
              const { exportChangeset } = useCryptoStore.getState()
              try {
                const currentChangeset = await exportChangeset()
                await updateDescriptorWalletChangeset(
                  sessionPassword,
                  activeWalletId,
                  toBitcoinNetwork(previousNetworkMode),
                  addressType,
                  accountId,
                  currentChangeset,
                )
              } catch {
                // No active WASM wallet yet (e.g., first load) -- safe to skip
              }
              await loadDescriptorWalletWithoutSync(
                sessionPassword,
                activeWalletId,
                'lab',
                addressType,
                accountId,
              )
            }
          }
          await prefetchLabChainState(appQueryClient)
          setNetworkMode('lab')
        } catch (err) {
          toast.error(errorMessage(err) || 'Failed to start lab')
        } finally {
          setSwitching(false)
        }
        return
      }

      if (previousNetworkMode === 'lab') {
        if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
          setSwitching(true)
          try {
            await switchDescriptorWallet(
              network,
              addressType,
              accountId,
              previousNetworkMode,
              addressType,
              accountId,
            )
            terminateLabWorker()
            setNetworkMode(network)
          } catch {
            // switchDescriptorWallet already showed a toast
          } finally {
            setSwitching(false)
          }
        } else {
          terminateLabWorker()
          setNetworkMode(network)
        }
        return
      }

      if (walletStatus === 'unlocked' || walletStatus === 'syncing') {
        setSwitching(true)
        try {
          await switchDescriptorWallet(
            network,
            addressType,
            accountId,
            previousNetworkMode,
            addressType,
            accountId,
          )
          setNetworkMode(network)
        } catch {
          // switchDescriptorWallet already showed a toast
        } finally {
          setSwitching(false)
        }
      } else {
        setNetworkMode(network)
      }
    },
    [networkMode, setNetworkMode, walletStatus, addressType, accountId],
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {NETWORK_OPTIONS.map((network) => (
          <Button
            key={network}
            variant={networkMode === network ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleNetworkChange(network)}
            disabled={switching}
          >
            {NETWORK_LABELS[network]}
          </Button>
        ))}
      </div>
      {networkMode === 'lab' && (
        <div>
          <Link to="/lab">
            <Button variant="outline" size="sm">
              Manage lab
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}

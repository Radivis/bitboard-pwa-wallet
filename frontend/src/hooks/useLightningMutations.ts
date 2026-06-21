import { useMemo, useSyncExternalStore } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useWalletStore } from '@/stores/walletStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useReceiveStore } from '@/stores/receiveStore'
import { useSendStore } from '@/stores/sendStore'
import type { NetworkMode } from '@/stores/walletStore'
import {
  createBackendService,
  fetchNwcChainTipBlockHeight,
  type ConnectedLightningWallet,
  type NwcConnectionConfig,
  type LightningConnectionConfig,
} from '@/lib/lightning/lightning-backend-service'
import { ensureMigrated } from '@/db/database'
import {
  loadNwcSnapshotForConnection,
} from '@/lib/lightning/lightning-wallet-snapshot-persistence'
import {
  fetchEsploraTipBlockHeight,
  getEsploraUrl,
  NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE,
} from '@/lib/wallet/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet/wallet-utils'
import {
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  isLightningSupported,
  type LightningNetworkMode,
} from '@/lib/lightning/lightning-utils'
import {
  formatAmountInBitcoinDisplayUnit,
  getPrefixedBitcoinDisplayUnitLabel,
} from '@/lib/wallet/bitcoin-display-unit'
import { getLightningConnectionsForActiveWallet } from '@/lib/lightning/lightning-connection-utils'
import {
  fetchLightningBalancesForDashboard,
  fetchLightningPaymentsForActiveWallet,
  invalidateLightningDashboardQueries,
  lightningConnectionsFingerprint,
  lightningDashboardBalancesQueryKey,
  lightningDashboardHistoryQueryKey,
} from '@/lib/lightning/lightning-dashboard-sync'
import {
  lnNwcNetworkPlausibilityQueryKey,
  lnWalletBalanceQueryKey,
} from '@/lib/lightning/lightning-query-keys'
import {
  LIGHTNING_DASHBOARD_REFETCH_MS,
  LIGHTNING_DASHBOARD_STALE_MS,
  LN_WALLET_BALANCE_STALE_MS,
  LN_WALLET_NETWORK_PLAUSIBILITY_STALE_MS,
} from '@/lib/lightning/lightning-query-timings'
import { useIsLightningRailLoaded } from '@/hooks/useLightningLifecycleSnapshots'
import {
  orchestrateLightningSaveSnapshotPatches,
} from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import { runWithLightningConnectionSync } from '@/lib/wallet/lifecycle/lightning-sync-lifecycle-orchestrator'
import { isWalletSecretsSessionActive } from '@/lib/wallet/wallet-secrets-session'
import type { NwcSnapshotPatch } from '@/lib/lightning/lightning-wallet-snapshot-persistence'

async function persistLightningSnapshotPatchesIfNeeded(params: {
  walletId: number
  networkMode: NetworkMode
  patches: NwcSnapshotPatch[]
}): Promise<void> {
  if (params.patches.length === 0) {
    return
  }
  await orchestrateLightningSaveSnapshotPatches({
    walletId: params.walletId,
    networkMode: params.networkMode,
    patches: params.patches,
  })
}

function subscribeOnlineStatus(onStoreChange: () => void) {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

function getNavigatorOnlineSnapshot(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine
}

/** Reactive `navigator.onLine` for query `enabled` and refetch behavior. */
export function useNavigatorOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnlineStatus,
    getNavigatorOnlineSnapshot,
    () => true,
  )
}

function useLightningDashboardQueryBase() {
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const connectedWallets = useLightningStore((lightningState) => lightningState.connectedWallets)
  const isOnline = useNavigatorOnline()

  const matchingConnections = useMemo(
    () =>
      getLightningConnectionsForActiveWallet({
        connectedLightningWallets: connectedWallets,
        activeWalletId,
        networkMode,
        isLightningEnabled: isLightningEnabled,
      }),
    [isLightningEnabled, networkMode, activeWalletId, connectedWallets],
  )

  const fingerprint = lightningConnectionsFingerprint(matchingConnections)
  const lightningRailLoaded = useIsLightningRailLoaded()

  const enabled =
    isLightningEnabled &&
    isLightningSupported(networkMode) &&
    activeWalletId != null &&
    lightningRailLoaded &&
    matchingConnections.length > 0 &&
    isOnline

  return { enabled, fingerprint }
}

/**
 * NWC `list_transactions` merged for all matching connections (React Query cache).
 */
export function useLightningHistoryQuery() {
  const { enabled, fingerprint } = useLightningDashboardQueryBase()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)

  return useQuery({
    queryKey: lightningDashboardHistoryQueryKey(fingerprint),
    queryFn: async () => {
      const fetchResult = await fetchLightningPaymentsForActiveWallet()
      if (activeWalletId != null) {
        await persistLightningSnapshotPatchesIfNeeded({
          walletId: activeWalletId,
          networkMode,
          patches: fetchResult.patches,
        })
      }
      return {
        payments: fetchResult.payments,
        stalePaymentsAsOf: fetchResult.stalePaymentsAsOf,
      }
    },
    enabled,
    staleTime: LIGHTNING_DASHBOARD_STALE_MS,
    refetchInterval: () =>
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible'
        ? LIGHTNING_DASHBOARD_REFETCH_MS
        : false,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

/**
 * Per-connection and total Lightning balance for the dashboard Balance card.
 */
export function useLightningBalancesForDashboardQuery() {
  const { enabled, fingerprint } = useLightningDashboardQueryBase()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const networkMode = useWalletStore((walletState) => walletState.networkMode)

  return useQuery({
    queryKey: lightningDashboardBalancesQueryKey(fingerprint),
    queryFn: async () => {
      const fetchResult = await fetchLightningBalancesForDashboard()
      if (activeWalletId != null) {
        await persistLightningSnapshotPatchesIfNeeded({
          walletId: activeWalletId,
          networkMode,
          patches: fetchResult.patches,
        })
      }
      return {
        lightningBalanceRows: fetchResult.lightningBalanceRows,
        totalSats: fetchResult.totalSats,
      }
    },
    enabled,
    staleTime: LIGHTNING_DASHBOARD_STALE_MS,
    refetchInterval: () =>
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible'
        ? LIGHTNING_DASHBOARD_REFETCH_MS
        : false,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export interface LnWalletBalanceQueryResult {
  balanceSats: number
  isStaleBalance?: boolean
  balanceSnapshotAt?: string
}

export function useLnWalletBalanceQuery(params: {
  connectionId: string
  walletId: number
  networkMode: LightningNetworkMode
  config: LightningConnectionConfig
}) {
  const { connectionId, walletId, networkMode, config } = params
  return useQuery({
    queryKey: lnWalletBalanceQueryKey({
      connectionId,
      walletId,
      networkMode,
      config,
    }),
    queryFn: async (): Promise<LnWalletBalanceQueryResult> => {
      await ensureMigrated()
      try {
        const { balanceSats } = await runWithLightningConnectionSync(connectionId, async () => {
          const service = createBackendService(config)
          return service.getBalance()
        })
        const balanceUpdatedAt = new Date().toISOString()
        if (await isWalletSecretsSessionActive()) {
          await orchestrateLightningSaveSnapshotPatches({
            walletId,
            networkMode,
            patches: [
              {
                connectionId,
                balance: { balanceSats, balanceUpdatedAt },
              },
            ],
          })
        }
        return { balanceSats }
      } catch (err) {
        if (await isWalletSecretsSessionActive()) {
          const snap = await loadNwcSnapshotForConnection({
            walletId,
            connectionId,
          })
          if (snap != null && snap.balanceUpdatedAt.length > 0) {
            return {
              balanceSats: snap.balanceSats,
              isStaleBalance: true,
              balanceSnapshotAt: snap.balanceUpdatedAt,
            }
          }
        }
        throw err instanceof Error ? err : new Error('Balance unavailable')
      }
    },
    staleTime: LN_WALLET_BALANCE_STALE_MS,
    retry: 1,
  })
}

/**
 * Compares NWC `get_info` chain tip to the configured Esplora tip for the
 * connection's Lightning network. Large drift suggests a network mismatch.
 */
export function useLnWalletNetworkPlausibilityQuery(
  wallet: ConnectedLightningWallet | null,
) {
  return useQuery({
    queryKey: lnNwcNetworkPlausibilityQueryKey(wallet),
    queryFn: async () => {
      if (!wallet) {
        throw new Error('No Lightning wallet')
      }
      const networkMode = wallet.networkMode as NetworkMode
      const customUrl = await loadCustomEsploraUrl(networkMode)
      const esploraUrl = getEsploraUrl(networkMode, customUrl)
      if (!esploraUrl) {
        throw new Error('No Esplora URL for this network')
      }
      const [esploraHeight, nwcHeight] = await Promise.all([
        fetchEsploraTipBlockHeight(esploraUrl),
        fetchNwcChainTipBlockHeight(wallet.config),
      ])
      const delta = Math.abs(esploraHeight - nwcHeight)
      return {
        esploraHeight,
        nwcHeight,
        delta,
        probableMismatch: delta > NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE,
      }
    },
    enabled: wallet != null,
    staleTime: LN_WALLET_NETWORK_PLAUSIBILITY_STALE_MS,
    retry: 1,
  })
}

export function useTestConnectionMutation() {
  return useMutation({
    mutationFn: async (config: NwcConnectionConfig) => {
      const service = createBackendService(config)
      return service.testConnection()
    },
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Connected to "${result.walletName}"`)
      } else {
        toast.error(`Connection failed: ${result.error}`)
      }
    },
    onError: (err) => {
      toast.error(`Connection test failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useCreateInvoiceMutation(onCreated: () => void) {
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const createInvoice = useLightningStore((lightningState) => lightningState.createInvoice)
  const addSessionInvoice = useReceiveStore((receiveState) => receiveState.addSessionInvoice)

  return useMutation({
    mutationFn: async (params: {
      amountSats?: number
      description: string
      expirySeconds?: number
    }) => {
      return createInvoice({
        ...(params.amountSats != null ? { amountSats: params.amountSats } : {}),
        description: params.description,
        expirySeconds: params.expirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS,
        networkMode,
      })
    },
    onSuccess: (invoice) => {
      addSessionInvoice(invoice)
      if (invoice.amountSats == null) {
        toast.success('Amountless invoice created')
      } else {
        toast.success(
          `Invoice created for ${formatAmountInBitcoinDisplayUnit(invoice.amountSats, 'BTC')} ${getPrefixedBitcoinDisplayUnitLabel('BTC', networkMode)}`,
        )
      }
      onCreated()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create invoice')
    },
  })
}

export function useLightningPayMutation() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (params: {
      bolt11: string
      config: LightningConnectionConfig
      /** Required for amountless BOLT11 (NIP-47 `pay_invoice.amount` in msats). */
      amountMsats?: number
    }) => {
      const service = createBackendService(params.config)
      return service.payInvoice(params.bolt11, {
        amountMsats: params.amountMsats,
      })
    },
    onSuccess: () => {
      invalidateLightningDashboardQueries()
      toast.success('Lightning payment sent!')
      const { setRecipient, setAmount } = useSendStore.getState()
      setRecipient('')
      setAmount('')
      navigate({ to: '/wallet' })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Lightning payment failed')
    },
  })
}

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
} from '@/lib/lightning-backend-service'
import {
  fetchEsploraTipBlockHeight,
  getEsploraUrl,
  NWC_ESPLORA_BLOCK_HEIGHT_TOLERANCE,
} from '@/lib/bitcoin-utils'
import { loadCustomEsploraUrl } from '@/lib/wallet-utils'
import {
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  formatSatsCompact,
  isLightningSupported,
  type LightningNetworkMode,
} from '@/lib/lightning-utils'
import {
  fetchLightningBalancesForDashboard,
  fetchLightningPaymentsForActiveWallet,
  invalidateLightningDashboardQueries,
  lightningConnectionsFingerprint,
  lightningDashboardBalancesQueryKey,
  lightningDashboardHistoryQueryKey,
} from '@/lib/lightning-dashboard-sync'

const LIGHTNING_DASHBOARD_REFETCH_MS = 60_000
const LIGHTNING_DASHBOARD_STALE_MS = 30_000

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
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const networkMode = useWalletStore((s) => s.networkMode)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)
  const connectedWallets = useLightningStore((s) => s.connectedWallets)
  const isOnline = useNavigatorOnline()

  const matchingConnections = useMemo(() => {
    if (
      !lightningEnabled ||
      !isLightningSupported(networkMode) ||
      activeWalletId == null
    ) {
      return []
    }
    const lnMode = networkMode as LightningNetworkMode
    return connectedWallets.filter(
      (w) => w.walletId === activeWalletId && w.networkMode === lnMode,
    )
  }, [lightningEnabled, networkMode, activeWalletId, connectedWallets])

  const fingerprint = lightningConnectionsFingerprint(matchingConnections)

  const enabled =
    lightningEnabled &&
    isLightningSupported(networkMode) &&
    activeWalletId != null &&
    (walletStatus === 'unlocked' || walletStatus === 'syncing') &&
    matchingConnections.length > 0 &&
    isOnline

  return { enabled, fingerprint }
}

/**
 * NWC `list_transactions` merged for all matching connections (React Query cache).
 */
export function useLightningHistoryQuery() {
  const { enabled, fingerprint } = useLightningDashboardQueryBase()

  return useQuery({
    queryKey: lightningDashboardHistoryQueryKey(fingerprint),
    queryFn: fetchLightningPaymentsForActiveWallet,
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

  return useQuery({
    queryKey: lightningDashboardBalancesQueryKey(fingerprint),
    queryFn: fetchLightningBalancesForDashboard,
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

export function useLnWalletBalanceQuery(config: LightningConnectionConfig) {
  return useQuery({
    queryKey: ['ln-wallet-balance', config],
    queryFn: async () => {
      const service = createBackendService(config)
      return service.getBalance()
    },
    staleTime: 30_000,
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
    queryKey: [
      'ln-nwc-network-plausibility',
      wallet?.id,
      wallet?.networkMode,
      wallet?.config,
    ],
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
    staleTime: 60_000,
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
  const networkMode = useWalletStore((s) => s.networkMode)
  const createInvoice = useLightningStore((s) => s.createInvoice)
  const addSessionInvoice = useReceiveStore((s) => s.addSessionInvoice)

  return useMutation({
    mutationFn: async (params: {
      amountSats: number
      description: string
      expirySeconds?: number
    }) => {
      return createInvoice({
        amountSats: params.amountSats,
        description: params.description,
        expirySeconds: params.expirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS,
        networkMode,
      })
    },
    onSuccess: (invoice) => {
      addSessionInvoice(invoice)
      toast.success(`Invoice created for ${formatSatsCompact(invoice.amountSats)}`)
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
    }) => {
      const service = createBackendService(params.config)
      return service.payInvoice(params.bolt11)
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

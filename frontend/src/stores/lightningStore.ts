import { create, type StoreApi } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  LIGHTNING_NETWORK_MODES,
  isLightningSupported,
  type LightningNetworkMode,
} from '@/lib/lightning/lightning-utils'
import { MAX_LIGHTNING_INVOICE_DESCRIPTION_LENGTH } from '@/lib/lightning/lightning-input-limits'
import {
  createBackendService,
  isValidNwcConnectionString,
  type ConnectedLightningWallet,
  type LightningConnectionConfig,
} from '@/lib/lightning/lightning-backend-service'
import {
  loadLightningConnectionsForWallet,
  type LightningConnectionsUpdate,
} from '@/lib/lightning/lightning-wallet-secrets'
import { orchestrateLightningSaveConnections } from '@/lib/wallet/lifecycle/lightning-save-lifecycle-orchestrator'
import { reloadLightningRailAfterConnectionsChanged } from '@/lib/wallet/lifecycle/lightning-load-lifecycle-orchestrator'
import { useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'
import {
  getConfiguredHistoricalSignetOnchainChain,
  historicalSignetOnchainWasMutinynet,
  LIGHTNING_PERSIST_STORAGE_KEY,
  renameSignetMapKeyToMutinynet,
  type HistoricalSignetOnchainChain,
} from '@/lib/wallet/historical-signet-onchain-chain'
import { MAX_LIGHTNING_WALLET_LABEL_LENGTH } from '@/lib/lightning/lightning-input-limits'
import {
  isReservedDefaultNwcConnectionLabel,
  resolveDefaultNwcConnectionLabel,
} from '@/lib/lightning/nwc-default-connection-label'
import {
  reconcileActiveLightningConnectionIds,
  resolveActiveLightningConnection,
  type ActiveLightningConnectionsByNetwork,
} from '@/lib/lightning/lightning-connection-utils'

/**
 * Whether the given Bitcoin wallet has at least one Lightning connection for the
 * app’s current chain mode (e.g. Signet). Lab and unsupported modes yield false.
 */
export function hasNetworkConnectedWallet(
  connectedWallets: ConnectedLightningWallet[],
  walletId: number | null | undefined,
  networkMode: NetworkMode,
): boolean {
  if (walletId == null || !isLightningSupported(networkMode)) {
    return false
  }
  const lnMode = networkMode as LightningNetworkMode
  return connectedWallets.some(
    (connection) =>
      connection.walletId === walletId && connection.networkMode === lnMode,
  )
}

export type { ConnectedLightningWallet, LightningConnectionConfig }
export type { NwcConnectionConfig, LightningWalletType } from '@/lib/lightning/lightning-backend-service'
export type { LightningNetworkMode } from '@/lib/lightning/lightning-utils'
export type { ActiveLightningConnectionsByNetwork } from '@/lib/lightning/lightning-connection-utils'

export interface LightningInvoice {
  bolt11: string
  paymentHash: string
  /** Fixed amount in sats, or `null` when the BOLT11 is amountless (payer chooses). */
  amountSats: number | null
  description: string
  expirySeconds: number
  createdAt: string
  status: 'pending' | 'paid' | 'expired'
}

interface LightningState {
  connectedWallets: ConnectedLightningWallet[]
  activeConnectionIds: Record<number, ActiveLightningConnectionsByNetwork>
  invoices: LightningInvoice[]

  /**
   * Replace in-memory connections for one wallet (e.g. after decrypting wallet_secrets).
   */
  replaceConnectionsForWallet: (
    walletId: number,
    connections: ConnectedLightningWallet[],
  ) => void

  /** Clear decrypted NWC material from memory (call on wallet lock). */
  purgeLightningConnectionsFromMemory: () => void

  /** Drop in-memory NWC state for one Bitcoin wallet (e.g. after it was deleted from the DB). */
  removeLightningStateForWallet: (walletId: number) => void

  addConnection: (params: {
    walletId: number
    label: string
    networkMode: LightningNetworkMode
    config: LightningConnectionConfig
  }) => Promise<{ id: string; label: string }>

  removeConnection: (connectionId: string) => Promise<void>

  renameConnection: (params: {
    connectionId: string
    newLabel: string
  }) => Promise<void>

  setActiveConnection: (
    walletId: number,
    networkMode: LightningNetworkMode,
    connectionId: string,
  ) => void

  getConnectionsForWallet: (walletId: number) => ConnectedLightningWallet[]
  getActiveConnection: (
    walletId: number,
    networkMode: NetworkMode,
  ) => ConnectedLightningWallet | null

  /** @see {@link hasNetworkConnectedWallet} */
  hasNetworkConnectedWallet: (
    walletId: number,
    networkMode: NetworkMode,
  ) => boolean

  createInvoice: (params: {
    amountSats?: number
    description: string
    expirySeconds?: number
    networkMode: NetworkMode
  }) => Promise<LightningInvoice>
  clearInvoices: () => void
}

/**
 * Persisted Lightning `signet` selections were Mutinynet only when the
 * pre-split Esplora chain was Mutinynet. Other chains keep the signet key.
 */
export function migrateLightningPersistedState(
  persistedState: unknown,
  version: number,
  historicalSignetChain: HistoricalSignetOnchainChain | null = getConfiguredHistoricalSignetOnchainChain(),
): unknown {
  if (version >= 1 || persistedState == null || typeof persistedState !== 'object') {
    return persistedState
  }
  if (!historicalSignetOnchainWasMutinynet(historicalSignetChain)) {
    return persistedState
  }
  const state = persistedState as {
    activeConnectionIds?: Record<string, Record<string, string> | undefined>
  }
  const activeConnectionIds = state.activeConnectionIds
  if (activeConnectionIds == null || typeof activeConnectionIds !== 'object') {
    return persistedState
  }
  const nextIds: Record<string, Record<string, string>> = {}
  for (const [walletId, perNetwork] of Object.entries(activeConnectionIds)) {
    if (perNetwork == null || typeof perNetwork !== 'object') continue
    const renamed = { ...perNetwork }
    renameSignetMapKeyToMutinynet(renamed)
    nextIds[walletId] = renamed as Record<string, string>
  }
  return { ...state, activeConnectionIds: nextIds }
}

type LightningStoreAccess = {
  set: StoreApi<LightningState>['setState']
  get: StoreApi<LightningState>['getState']
}

function withoutConnection(
  connections: ConnectedLightningWallet[],
  connectionId: string,
): ConnectedLightningWallet[] {
  return connections.filter((connection) => connection.id !== connectionId)
}

/** Moves each network's active selection off the removed connection, if another one is left. */
function activeConnectionIdsAfterRemoval(params: {
  activeConnectionIds: Record<number, ActiveLightningConnectionsByNetwork>
  walletId: number
  removedConnectionId: string
  remainingForWallet: ConnectedLightningWallet[]
}): Record<number, ActiveLightningConnectionsByNetwork> {
  const { walletId, removedConnectionId, remainingForWallet } = params
  const updatedActiveIds = { ...params.activeConnectionIds }
  const perNetwork: ActiveLightningConnectionsByNetwork = {
    ...(updatedActiveIds[walletId] ?? {}),
  }
  for (const mode of LIGHTNING_NETWORK_MODES) {
    if (perNetwork[mode] !== removedConnectionId) continue
    const replacement = remainingForWallet.find((connection) => connection.networkMode === mode)
    if (replacement) {
      perNetwork[mode] = replacement.id
    } else {
      delete perNetwork[mode]
    }
  }
  if (Object.keys(perNetwork).length === 0) {
    delete updatedActiveIds[walletId]
  } else {
    updatedActiveIds[walletId] = perNetwork
  }
  return updatedActiveIds
}

/**
 * Shows `updateConnections` applied to `storedForWallet` right away, then persists it as a
 * transform on the list stored at write time and adopts the list that was written.
 */
async function commitLightningConnectionsUpdate(params: {
  store: LightningStoreAccess
  walletId: number
  networkMode: NetworkMode
  storedForWallet: ConnectedLightningWallet[]
  updateConnections: LightningConnectionsUpdate
  activeConnectionIdsAfterUpdate?: (
    nextForWallet: ConnectedLightningWallet[],
  ) => Record<number, ActiveLightningConnectionsByNetwork>
}): Promise<void> {
  const { store, walletId, networkMode, updateConnections, activeConnectionIdsAfterUpdate } = params
  const optimisticForWallet = updateConnections(params.storedForWallet)
  store.set({
    connectedWallets: [
      ...store.get().connectedWallets.filter((connection) => connection.walletId !== walletId),
      ...optimisticForWallet,
    ],
    ...(activeConnectionIdsAfterUpdate
      ? { activeConnectionIds: activeConnectionIdsAfterUpdate(optimisticForWallet) }
      : {}),
  })

  let writtenForWallet = optimisticForWallet
  await orchestrateLightningSaveConnections({
    walletId,
    networkMode,
    updateConnections: (storedConnections) => {
      writtenForWallet = updateConnections(storedConnections)
      return writtenForWallet
    },
  })
  store.get().replaceConnectionsForWallet(walletId, writtenForWallet)
}

export const useLightningStore = create<LightningState>()(
  persist(
    (set, get) => ({
      connectedWallets: [],
      activeConnectionIds: {},
      invoices: [],

      replaceConnectionsForWallet: (walletId, connections) => {
        set((state) => ({
          connectedWallets: [
            ...state.connectedWallets.filter((connection) => connection.walletId !== walletId),
            ...connections,
          ],
          activeConnectionIds: reconcileActiveLightningConnectionIds({
            walletId,
            connections,
            activeConnectionIds: state.activeConnectionIds,
          }),
        }))
      },

      purgeLightningConnectionsFromMemory: () =>
        set({ connectedWallets: [], activeConnectionIds: {} }),

      removeLightningStateForWallet: (walletId) =>
        set((state) => {
          const nextActiveIds = { ...state.activeConnectionIds }
          delete nextActiveIds[walletId]
          return {
            connectedWallets: state.connectedWallets.filter(
              (connection) => connection.walletId !== walletId,
            ),
            activeConnectionIds: nextActiveIds,
          }
        }),

      addConnection: async ({ walletId, label, networkMode, config }) => {
        if (config.type !== 'nwc' || !isValidNwcConnectionString(config.connectionString)) {
          throw new Error('Invalid NWC connection string')
        }

        const forWallet = await loadLightningConnectionsForWallet({ walletId })

        const trimmedLabel = label.trim()
        const labelToStore =
          trimmedLabel.length > 0
            ? trimmedLabel
            : resolveDefaultNwcConnectionLabel(forWallet.map((connection) => connection.label))
        if (labelToStore.length > MAX_LIGHTNING_WALLET_LABEL_LENGTH) {
          throw new Error(
            `Label must be at most ${MAX_LIGHTNING_WALLET_LABEL_LENGTH} characters`,
          )
        }

        const id = crypto.randomUUID()
        const connection: ConnectedLightningWallet = {
          id,
          walletId,
          label: labelToStore,
          networkMode,
          config,
          createdAt: new Date().toISOString(),
        }

        await commitLightningConnectionsUpdate({
          store: { set, get },
          walletId,
          networkMode,
          storedForWallet: forWallet,
          updateConnections: (storedConnections) => [
            ...withoutConnection(storedConnections, id),
            connection,
          ],
          activeConnectionIdsAfterUpdate: () => {
            const updatedActiveIds = { ...get().activeConnectionIds }
            updatedActiveIds[walletId] = {
              ...(updatedActiveIds[walletId] ?? {}),
              [networkMode]: id,
            }
            return updatedActiveIds
          },
        })
        await reloadLightningRailAfterConnectionsChanged(walletId)
        return { id, label: labelToStore }
      },

      removeConnection: async (connectionId) => {
        const removed = get().connectedWallets.find((connection) => connection.id === connectionId)
        if (!removed) {
          return
        }

        const { walletId } = removed
        const persistedForWallet = await loadLightningConnectionsForWallet({ walletId })
        await commitLightningConnectionsUpdate({
          store: { set, get },
          walletId,
          networkMode: removed.networkMode,
          storedForWallet: persistedForWallet,
          updateConnections: (storedConnections) =>
            withoutConnection(storedConnections, connectionId),
          activeConnectionIdsAfterUpdate: (remainingForWallet) =>
            activeConnectionIdsAfterRemoval({
              activeConnectionIds: get().activeConnectionIds,
              walletId,
              removedConnectionId: connectionId,
              remainingForWallet,
            }),
        })
        await reloadLightningRailAfterConnectionsChanged(walletId)
      },

      renameConnection: async ({ connectionId, newLabel }) => {
        const trimmed = newLabel.trim()
        if (trimmed.length === 0) {
          throw new Error('Enter a label for this Lightning wallet')
        }
        if (trimmed.length > MAX_LIGHTNING_WALLET_LABEL_LENGTH) {
          throw new Error(
            `Label must be at most ${MAX_LIGHTNING_WALLET_LABEL_LENGTH} characters`,
          )
        }
        if (isReservedDefaultNwcConnectionLabel(trimmed)) {
          throw new Error(
            'That name is reserved for automatically named connections. Choose a different label.',
          )
        }

        const target = get().connectedWallets.find((connection) => connection.id === connectionId)
        if (!target) {
          throw new Error('Lightning connection not found')
        }

        const { walletId } = target
        const persistedForWallet = await loadLightningConnectionsForWallet({ walletId })
        const duplicate = persistedForWallet.some(
          (connection) =>
            connection.id !== connectionId &&
            connection.label.trim() === trimmed,
        )
        if (duplicate) {
          throw new Error('Another Lightning wallet already uses this label')
        }

        await commitLightningConnectionsUpdate({
          store: { set, get },
          walletId,
          networkMode: target.networkMode,
          storedForWallet: persistedForWallet,
          updateConnections: (storedConnections) =>
            storedConnections.map((connection) =>
              connection.id === connectionId ? { ...connection, label: trimmed } : connection,
            ),
        })
      },

      setActiveConnection: (walletId, networkMode, connectionId) => {
        const lightningConnection = get().connectedWallets.find((connection) => connection.id === connectionId)
        if (
          !lightningConnection ||
          lightningConnection.walletId !== walletId ||
          lightningConnection.networkMode !== networkMode
        ) {
          return
        }
        set({
          activeConnectionIds: {
            ...get().activeConnectionIds,
            [walletId]: {
              ...(get().activeConnectionIds[walletId] ?? {}),
              [networkMode]: connectionId,
            },
          },
        })
      },

      getConnectionsForWallet: (walletId) =>
        get().connectedWallets.filter((connection) => connection.walletId === walletId),

      getActiveConnection: (walletId, networkMode) =>
        resolveActiveLightningConnection({
          connectedWallets: get().connectedWallets,
          activeConnectionIds: get().activeConnectionIds,
          walletId,
          networkMode,
        }),

      hasNetworkConnectedWallet: (walletId, networkMode) =>
        hasNetworkConnectedWallet(get().connectedWallets, walletId, networkMode),

      createInvoice: async ({
        amountSats,
        description,
        expirySeconds,
        networkMode,
      }) => {
        if (description.length > MAX_LIGHTNING_INVOICE_DESCRIPTION_LENGTH) {
          throw new Error(
            `Description must be at most ${MAX_LIGHTNING_INVOICE_DESCRIPTION_LENGTH} characters`,
          )
        }
        const effectiveExpiry =
          expirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS
        const activeWalletId = useWalletStore.getState().activeWalletId
        const storedAmountSats =
          amountSats != null && amountSats >= 1 ? amountSats : null

        if (activeWalletId != null) {
          const connection = get().getActiveConnection(
            activeWalletId,
            networkMode,
          )
          if (connection) {
            const service = createBackendService(connection.config)
            const invoiceResponse = await service.createInvoice({
              ...(storedAmountSats != null ? { amountSats: storedAmountSats } : {}),
              memo: description,
              expiry: effectiveExpiry,
            })
            const invoice: LightningInvoice = {
              bolt11: invoiceResponse.bolt11,
              paymentHash: invoiceResponse.paymentHash,
              amountSats: storedAmountSats,
              description,
              expirySeconds: effectiveExpiry,
              createdAt: new Date().toISOString(),
              status: 'pending',
            }
            set({ invoices: [...get().invoices, invoice] })
            return invoice
          }
        }

        throw new Error(
          'Connect a Lightning wallet for this network to create invoices.',
        )
      },

      clearInvoices: () => set({ invoices: [] }),
    }),
    {
      name: LIGHTNING_PERSIST_STORAGE_KEY,
      storage: createJSONStorage(() => sqliteStorage),
      version: 1,
      migrate: migrateLightningPersistedState,
      partialize: (state) => ({
        activeConnectionIds: state.activeConnectionIds,
        invoices: state.invoices,
      }),
    },
  ),
)

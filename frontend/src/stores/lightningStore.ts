import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  generateMockBolt11Invoice,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
  LIGHTNING_NETWORK_MODES,
  isLightningSupported,
  type LightningNetworkMode,
} from '@/lib/lightning-utils'
import {
  createBackendService,
  type ConnectedLightningWallet,
  type LightningConnectionConfig,
} from '@/lib/lightning-backend-service'
import { useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

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
    (w) => w.walletId === walletId && w.networkMode === lnMode,
  )
}

export type { ConnectedLightningWallet, LightningConnectionConfig }
export type { NwcConnectionConfig, LightningWalletType } from '@/lib/lightning-backend-service'
export type { LightningNetworkMode } from '@/lib/lightning-utils'

export type ActiveLightningConnectionsByNetwork = Partial<
  Record<LightningNetworkMode, string>
>

export interface LightningInvoice {
  bolt11: string
  paymentHash: string
  amountSats: number
  description: string
  expirySeconds: number
  createdAt: string
  status: 'pending' | 'paid' | 'expired'
}

interface LightningState {
  connectedWallets: ConnectedLightningWallet[]
  activeConnectionIds: Record<number, ActiveLightningConnectionsByNetwork>
  invoices: LightningInvoice[]

  addConnection: (params: {
    walletId: number
    label: string
    networkMode: LightningNetworkMode
    config: LightningConnectionConfig
  }) => string
  removeConnection: (connectionId: string) => void
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
    amountSats: number
    description: string
    expirySeconds?: number
    networkMode: NetworkMode
  }) => Promise<LightningInvoice>
  clearInvoices: () => void
}

export const useLightningStore = create<LightningState>()(
  persist(
    (set, get) => ({
      connectedWallets: [],
      activeConnectionIds: {},
      invoices: [],

      addConnection: ({ walletId, label, networkMode, config }) => {
        const id = crypto.randomUUID()
        const connection: ConnectedLightningWallet = {
          id,
          walletId,
          label,
          networkMode,
          config,
          createdAt: new Date().toISOString(),
        }
        const updatedActiveIds = { ...get().activeConnectionIds }
        const perNetwork: ActiveLightningConnectionsByNetwork = {
          ...(updatedActiveIds[walletId] ?? {}),
          [networkMode]: id,
        }
        updatedActiveIds[walletId] = perNetwork
        set({
          connectedWallets: [...get().connectedWallets, connection],
          activeConnectionIds: updatedActiveIds,
        })
        return id
      },

      removeConnection: (connectionId) => {
        const removed = get().connectedWallets.find((w) => w.id === connectionId)
        const wallets = get().connectedWallets.filter(
          (w) => w.id !== connectionId,
        )
        const updatedActiveIds = { ...get().activeConnectionIds }

        if (removed) {
          const { walletId } = removed
          const perNetwork: ActiveLightningConnectionsByNetwork = {
            ...(updatedActiveIds[walletId] ?? {}),
          }
          for (const mode of LIGHTNING_NETWORK_MODES) {
            if (perNetwork[mode] === connectionId) {
              const replacement = wallets.find(
                (w) => w.walletId === walletId && w.networkMode === mode,
              )
              if (replacement) {
                perNetwork[mode] = replacement.id
              } else {
                delete perNetwork[mode]
              }
            }
          }
          if (Object.keys(perNetwork).length === 0) {
            delete updatedActiveIds[walletId]
          } else {
            updatedActiveIds[walletId] = perNetwork
          }
        }

        set({
          connectedWallets: wallets,
          activeConnectionIds: updatedActiveIds,
        })
      },

      setActiveConnection: (walletId, networkMode, connectionId) => {
        const conn = get().connectedWallets.find((w) => w.id === connectionId)
        if (
          !conn ||
          conn.walletId !== walletId ||
          conn.networkMode !== networkMode
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
        get().connectedWallets.filter((w) => w.walletId === walletId),

      getActiveConnection: (walletId, networkMode) => {
        if (!isLightningSupported(networkMode)) return null
        const lnMode = networkMode as LightningNetworkMode
        const activeId = get().activeConnectionIds[walletId]?.[lnMode]
        if (!activeId) return null
        const conn = get().connectedWallets.find((w) => w.id === activeId)
        if (!conn || conn.networkMode !== lnMode) return null
        return conn
      },

      hasNetworkConnectedWallet: (walletId, networkMode) =>
        hasNetworkConnectedWallet(get().connectedWallets, walletId, networkMode),

      createInvoice: async ({
        amountSats,
        description,
        expirySeconds,
        networkMode,
      }) => {
        const effectiveExpiry =
          expirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS
        const activeWalletId = useWalletStore.getState().activeWalletId

        if (activeWalletId != null) {
          const connection = get().getActiveConnection(
            activeWalletId,
            networkMode,
          )
          if (connection) {
            const service = createBackendService(connection.config)
            const result = await service.createInvoice({
              amountSats,
              memo: description,
              expiry: effectiveExpiry,
            })
            const invoice: LightningInvoice = {
              bolt11: result.bolt11,
              paymentHash: result.paymentHash,
              amountSats,
              description,
              expirySeconds: effectiveExpiry,
              createdAt: new Date().toISOString(),
              status: 'pending',
            }
            set({ invoices: [...get().invoices, invoice] })
            return invoice
          }
        }

        const bolt11 = generateMockBolt11Invoice({
          networkMode,
          amountSats,
          description,
          expirySeconds: effectiveExpiry,
        })
        const invoice: LightningInvoice = {
          bolt11,
          paymentHash: '',
          amountSats,
          description,
          expirySeconds: effectiveExpiry,
          createdAt: new Date().toISOString(),
          status: 'pending',
        }
        set({ invoices: [...get().invoices, invoice] })
        return invoice
      },

      clearInvoices: () => set({ invoices: [] }),
    }),
    {
      name: 'lightning-storage',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        connectedWallets: state.connectedWallets,
        activeConnectionIds: state.activeConnectionIds,
        invoices: state.invoices,
      }),
    },
  ),
)

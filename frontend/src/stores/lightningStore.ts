import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  generateMockBolt11Invoice,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
} from '@/lib/lightning-utils'
import {
  createBackendService,
  type ConnectedLightningWallet,
  type LightningConnectionConfig,
} from '@/lib/lightning-backend-service'
import { useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'

export type { ConnectedLightningWallet, LightningConnectionConfig }
export type { LnbitsConnectionConfig, LightningWalletType } from '@/lib/lightning-backend-service'

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
  activeConnectionIds: Record<number, string>
  invoices: LightningInvoice[]

  addConnection: (params: {
    walletId: number
    label: string
    config: LightningConnectionConfig
  }) => string
  removeConnection: (connectionId: string) => void
  setActiveConnection: (walletId: number, connectionId: string) => void

  getConnectionsForWallet: (walletId: number) => ConnectedLightningWallet[]
  getActiveConnection: (walletId: number) => ConnectedLightningWallet | null

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

      addConnection: ({ walletId, label, config }) => {
        const id = crypto.randomUUID()
        const connection: ConnectedLightningWallet = {
          id,
          walletId,
          label,
          config,
          createdAt: new Date().toISOString(),
        }
        const existingForWallet = get().connectedWallets.filter(
          (w) => w.walletId === walletId,
        )
        const updatedActiveIds = { ...get().activeConnectionIds }
        if (existingForWallet.length === 0) {
          updatedActiveIds[walletId] = id
        }
        set({
          connectedWallets: [...get().connectedWallets, connection],
          activeConnectionIds: updatedActiveIds,
        })
        return id
      },

      removeConnection: (connectionId) => {
        const wallets = get().connectedWallets.filter(
          (w) => w.id !== connectionId,
        )
        const updatedActiveIds = { ...get().activeConnectionIds }
        for (const [walletIdStr, activeId] of Object.entries(updatedActiveIds)) {
          if (activeId === connectionId) {
            const walletId = Number(walletIdStr)
            const remaining = wallets.filter((w) => w.walletId === walletId)
            if (remaining.length > 0) {
              updatedActiveIds[walletId] = remaining[0].id
            } else {
              delete updatedActiveIds[walletId]
            }
          }
        }
        set({
          connectedWallets: wallets,
          activeConnectionIds: updatedActiveIds,
        })
      },

      setActiveConnection: (walletId, connectionId) => {
        set({
          activeConnectionIds: {
            ...get().activeConnectionIds,
            [walletId]: connectionId,
          },
        })
      },

      getConnectionsForWallet: (walletId) =>
        get().connectedWallets.filter((w) => w.walletId === walletId),

      getActiveConnection: (walletId) => {
        const activeId = get().activeConnectionIds[walletId]
        if (!activeId) return null
        return (
          get().connectedWallets.find((w) => w.id === activeId) ?? null
        )
      },

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
          const connection = get().getActiveConnection(activeWalletId)
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

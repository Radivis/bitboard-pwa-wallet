import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { sqliteStorage } from '@/db/storage-adapter'
import {
  generateMockBolt11Invoice,
  DEFAULT_INVOICE_EXPIRY_SECONDS,
} from '@/lib/lightning-utils'
import type { NetworkMode } from '@/stores/walletStore'

export interface LightningChannel {
  id: string
  peerNodeId: string
  peerAlias: string
  fundingAmountSats: number
  status: 'pending' | 'open' | 'closed'
  createdAt: string
}

export interface LightningInvoice {
  bolt11: string
  amountSats: number
  description: string
  expirySeconds: number
  createdAt: string
  status: 'pending' | 'paid' | 'expired'
}

interface LightningState {
  channels: LightningChannel[]
  invoices: LightningInvoice[]
  addChannel: (params: {
    peerNodeId: string
    peerAlias: string
    fundingAmountSats: number
  }) => void
  createInvoice: (params: {
    amountSats: number
    description: string
    expirySeconds?: number
    networkMode: NetworkMode
  }) => LightningInvoice
  clearChannels: () => void
  clearInvoices: () => void
}

export const useLightningStore = create<LightningState>()(
  persist(
    (set, get) => ({
      channels: [],
      invoices: [],

      addChannel: ({ peerNodeId, peerAlias, fundingAmountSats }) => {
        const channel: LightningChannel = {
          id: crypto.randomUUID(),
          peerNodeId,
          peerAlias,
          fundingAmountSats,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        set({ channels: [...get().channels, channel] })
      },

      createInvoice: ({ amountSats, description, expirySeconds, networkMode }) => {
        const effectiveExpiry = expirySeconds ?? DEFAULT_INVOICE_EXPIRY_SECONDS
        const bolt11 = generateMockBolt11Invoice({
          networkMode,
          amountSats,
          description,
          expirySeconds: effectiveExpiry,
        })
        const invoice: LightningInvoice = {
          bolt11,
          amountSats,
          description,
          expirySeconds: effectiveExpiry,
          createdAt: new Date().toISOString(),
          status: 'pending',
        }
        set({ invoices: [...get().invoices, invoice] })
        return invoice
      },

      clearChannels: () => set({ channels: [] }),
      clearInvoices: () => set({ invoices: [] }),
    }),
    {
      name: 'lightning-storage',
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        channels: state.channels,
        invoices: state.invoices,
      }),
    },
  ),
)

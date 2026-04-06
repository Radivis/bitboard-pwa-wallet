import { create } from 'zustand'
import type { LightningInvoice } from '@/stores/lightningStore'

interface ReceiveState {
  activeInvoice: LightningInvoice | null
  sessionInvoices: LightningInvoice[]
  setActiveInvoice: (invoice: LightningInvoice | null) => void
  addSessionInvoice: (invoice: LightningInvoice) => void
}

export const useReceiveStore = create<ReceiveState>((set, get) => ({
  activeInvoice: null,
  sessionInvoices: [],

  setActiveInvoice: (invoice) => set({ activeInvoice: invoice }),

  addSessionInvoice: (invoice) => {
    set({
      sessionInvoices: [...get().sessionInvoices, invoice],
      activeInvoice: invoice,
    })
  },
}))

export function isInvoiceExpired(invoice: LightningInvoice): boolean {
  const createdMs = new Date(invoice.createdAt).getTime()
  const expiresMs = createdMs + invoice.expirySeconds * 1000
  return Date.now() >= expiresMs
}

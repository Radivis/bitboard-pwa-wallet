import { create } from 'zustand'

interface NearZeroSecurityState {
  /** True when settings indicate near-zero mode is active (synced on bootstrap / opt-in / upgrade). */
  active: boolean
  setNearZeroSecurityActive: (active: boolean) => void
}

export const useNearZeroSecurityStore = create<NearZeroSecurityState>((set) => ({
  active: false,
  setNearZeroSecurityActive: (active) => set({ active }),
}))

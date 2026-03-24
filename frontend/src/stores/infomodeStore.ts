import { create } from 'zustand'

interface InfomodeState {
  isActive: boolean
  setInfomodeActive: (active: boolean) => void
  toggleInfomode: () => void
}

export const useInfomodeStore = create<InfomodeState>((set) => ({
  isActive: false,
  setInfomodeActive: (active) => set({ isActive: active }),
  toggleInfomode: () => set((state) => ({ isActive: !state.isActive })),
}))

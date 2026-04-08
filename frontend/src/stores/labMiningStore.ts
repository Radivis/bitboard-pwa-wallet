import { create } from 'zustand'
import { LAB_MIN_BLOCKS_PER_MINE } from '@/workers/lab-api'

interface LabMiningState {
  mineCount: string
  ownerType: 'name' | 'wallet'
  targetAddress: string
  ownerName: string
  setMineCount: (mineCount: string) => void
  setOwnerType: (ownerType: 'name' | 'wallet') => void
  setTargetAddress: (targetAddress: string) => void
  setOwnerName: (ownerName: string) => void
}

export const useLabMiningStore = create<LabMiningState>((set) => ({
  mineCount: String(LAB_MIN_BLOCKS_PER_MINE),
  ownerType: 'name',
  targetAddress: '',
  ownerName: '',
  setMineCount: (mineCount) => set({ mineCount }),
  setOwnerType: (ownerType) => set({ ownerType }),
  setTargetAddress: (targetAddress) => set({ targetAddress }),
  setOwnerName: (ownerName) => set({ ownerName }),
}))

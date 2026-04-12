import { create } from 'zustand'
import { LabOwnerType } from '@/lib/lab-owner-type'
import { LAB_MIN_BLOCKS_PER_MINE } from '@/workers/lab-api'

interface LabMiningState {
  mineCount: string
  ownerType: LabOwnerType
  /** Living lab entity to receive coinbase when ownerType is lab entity; null if none or not yet chosen. */
  selectedLabEntityId: number | null
  setMineCount: (mineCount: string) => void
  setOwnerType: (ownerType: LabOwnerType) => void
  setSelectedLabEntityId: (labEntityId: number | null) => void
}

export const useLabMiningStore = create<LabMiningState>((set) => ({
  mineCount: String(LAB_MIN_BLOCKS_PER_MINE),
  ownerType: LabOwnerType.LabEntity,
  selectedLabEntityId: null,
  setMineCount: (mineCount) => set({ mineCount }),
  setOwnerType: (ownerType) => set({ ownerType }),
  setSelectedLabEntityId: (selectedLabEntityId) => set({ selectedLabEntityId }),
}))

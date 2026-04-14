import { create } from 'zustand'

interface SecureStorageAvailabilityState {
  isAvailable: boolean
  lastErrorMessage: string | null
  /** Use OPFS-focused copy when true; broader copy when false but DB still failed. */
  opfsLikelyUnsupported: boolean
  markUnavailable: (payload: {
    lastErrorMessage: string | null
    opfsLikelyUnsupported: boolean
  }) => void
}

export const useSecureStorageAvailabilityStore =
  create<SecureStorageAvailabilityState>((set) => ({
    isAvailable: true,
    lastErrorMessage: null,
    opfsLikelyUnsupported: false,
    markUnavailable: ({ lastErrorMessage, opfsLikelyUnsupported }) =>
      set({ isAvailable: false, lastErrorMessage, opfsLikelyUnsupported }),
  }))

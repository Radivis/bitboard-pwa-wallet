import { create } from 'zustand'
import type {
  BarkEmergencyExitFundingStatus,
  BarkEmergencyExitScope,
} from '@/lib/bark/bark-emergency-exit-funding-status'
import {
  barkEmergencyExitChildrenWaitForFunds,
  type BarkEmergencyExitProgressOutcome,
} from '@/lib/bark/perform-bark-emergency-exit'

/** Whether the last Bark emergency exit progress run left children waiting for confirmed funds. */
interface BarkEmergencyExitFundingState {
  fundingStatus: BarkEmergencyExitFundingStatus | null
  /** Keeps the status while children are still waiting for funds, clears it otherwise. */
  recordProgressOutcome: (
    scope: BarkEmergencyExitScope,
    outcome: BarkEmergencyExitProgressOutcome,
  ) => void
  clearFundingStatus: () => void
}

export const useBarkEmergencyExitFundingStore = create<BarkEmergencyExitFundingState>((set) => ({
  fundingStatus: null,
  recordProgressOutcome: (scope, outcome) =>
    set({
      fundingStatus: barkEmergencyExitChildrenWaitForFunds(outcome)
        ? { ...scope, ...outcome }
        : null,
    }),
  clearFundingStatus: () => set({ fundingStatus: null }),
}))

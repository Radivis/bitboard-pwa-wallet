import { create } from 'zustand'
import type {
  BarkEmergencyExitFundingStatus,
  BarkEmergencyExitScope,
  BarkEmergencyExitUnfundedParents,
} from '@/lib/bark/bark-emergency-exit-funding-status'
import {
  barkEmergencyExitChildrenWaitForFunds,
  type BarkEmergencyExitProgressOutcome,
} from '@/lib/bark/perform-bark-emergency-exit'

/** Whether the last Bark emergency exit progress run left children waiting for confirmed funds. */
interface BarkEmergencyExitFundingState {
  fundingStatus: BarkEmergencyExitFundingStatus | null
  unfundedParents: BarkEmergencyExitUnfundedParents | null
  /** Keeps the status while children are still waiting for funds, clears it otherwise. */
  recordProgressOutcome: (
    scope: BarkEmergencyExitScope,
    outcome: BarkEmergencyExitProgressOutcome,
  ) => void
  /** Remembers parents that still need a confirmed coin without showing the funding banner. */
  recordUnfundedParents: (scope: BarkEmergencyExitScope, txids: readonly string[]) => void
  clearFundingStatus: () => void
  clearUnfundedParents: () => void
}

export const useBarkEmergencyExitFundingStore = create<BarkEmergencyExitFundingState>((set) => ({
  fundingStatus: null,
  unfundedParents: null,
  recordProgressOutcome: (scope, outcome) =>
    set({
      fundingStatus: barkEmergencyExitChildrenWaitForFunds(outcome)
        ? { ...scope, ...outcome }
        : null,
      unfundedParents: barkEmergencyExitChildrenWaitForFunds(outcome)
        ? { ...scope, txids: outcome.unfundedParentTxids }
        : null,
    }),
  recordUnfundedParents: (scope, txids) => set({ unfundedParents: { ...scope, txids } }),
  clearFundingStatus: () => set({ fundingStatus: null }),
  clearUnfundedParents: () => set({ unfundedParents: null }),
}))

import { create } from 'zustand'

export type BarkEmergencyExitAutomationPauseReason = 'feeCapExceeded' | 'fundsInsufficient'

export type BarkEmergencyExitAutomationActivity = {
  inFlight: boolean
  errorMessage: string | null
  pausedReason: BarkEmergencyExitAutomationPauseReason | null
}

export const IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY: BarkEmergencyExitAutomationActivity = {
  inFlight: false,
  errorMessage: null,
  pausedReason: null,
}

/** What the per-block Bark emergency exit automation is doing right now, and its last error. */
interface BarkEmergencyExitAutomationState extends BarkEmergencyExitAutomationActivity {
  setActivity: (activity: BarkEmergencyExitAutomationActivity) => void
}

export const useBarkEmergencyExitAutomationStore = create<BarkEmergencyExitAutomationState>(
  (set) => ({
    ...IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY,
    setActivity: (activity) => set(activity),
  }),
)

/** Stops automatic progress until the user changes the fee degree or the max. */
export function pauseBarkEmergencyExitAutomation(
  pausedReason: BarkEmergencyExitAutomationPauseReason,
): void {
  const state = useBarkEmergencyExitAutomationStore.getState()
  state.setActivity({
    inFlight: false,
    errorMessage: null,
    pausedReason,
  })
}

/** Lets the next automatic tick resolve the fee rate again. */
export function clearBarkEmergencyExitAutomationPause(): void {
  const state = useBarkEmergencyExitAutomationStore.getState()
  if (state.pausedReason == null) return
  state.setActivity({
    inFlight: state.inFlight,
    errorMessage: state.errorMessage,
    pausedReason: null,
  })
}

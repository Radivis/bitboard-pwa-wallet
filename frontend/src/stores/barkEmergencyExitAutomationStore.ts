import { create } from 'zustand'

export type BarkEmergencyExitAutomationActivity = {
  inFlight: boolean
  errorMessage: string | null
}

export const IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY: BarkEmergencyExitAutomationActivity = {
  inFlight: false,
  errorMessage: null,
}

/** What the per-block Bark exit automation is doing right now, and its last error. */
interface BarkEmergencyExitAutomationState extends BarkEmergencyExitAutomationActivity {
  setActivity: (activity: BarkEmergencyExitAutomationActivity) => void
}

export const useBarkEmergencyExitAutomationStore = create<BarkEmergencyExitAutomationState>(
  (set) => ({
    ...IDLE_BARK_EMERGENCY_EXIT_AUTOMATION_ACTIVITY,
    setActivity: (activity) => set(activity),
  }),
)

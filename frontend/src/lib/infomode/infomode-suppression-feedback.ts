import { toast } from 'sonner'
import { useInfomodeStore } from '@/stores/infomodeStore'

export const INFOMODE_PRIMARY_SUPPRESSED_TOAST_ID = 'infomode-primary-suppressed'

export const INFOMODE_SUPPRESSION_TOAST_TEXT =
  'Action has been suppressed due to active infomode. Deactivate infomode by tapping the lightbulb to resume normal app behavior.'

const INFOMODE_SUPPRESSION_TOAST_DURATION_MS = 8_000

/**
 * Called when infomode intercepts a click on a registered explainer zone (primary UI action
 * does not run). Surfaces a toast and nudges the lightbulb control visually.
 */
export function notifyInfomodePrimaryActionSuppressed(): void {
  toast.message(INFOMODE_SUPPRESSION_TOAST_TEXT, {
    id: INFOMODE_PRIMARY_SUPPRESSED_TOAST_ID,
    duration: INFOMODE_SUPPRESSION_TOAST_DURATION_MS,
  })
  useInfomodeStore.getState().bumpSuppressionVisualCue()
}

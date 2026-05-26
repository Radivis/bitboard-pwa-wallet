/** After this much time since last app open, show the returning-user Infomode reminder. */
export const APP_LAST_OPENED_REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export type InfomodeHintKind = 'none' | 'intro' | 'reminder'

/**
 * Pure branching for which Infomode nudge to show before updating last-opened.
 * - intro: no prior timestamp (new install or first run after this feature exists)
 * - reminder: last open was at least APP_LAST_OPENED_REMINDER_AFTER_MS ago
 * - none: recent visitor within the window
 */
export function getInfomodeHintKind(
  lastOpenedAt: Date | null,
  nowMs: number,
): InfomodeHintKind {
  if (lastOpenedAt === null) {
    return 'intro'
  }
  const elapsedMs = nowMs - lastOpenedAt.getTime()
  if (elapsedMs >= APP_LAST_OPENED_REMINDER_AFTER_MS) {
    return 'reminder'
  }
  return 'none'
}

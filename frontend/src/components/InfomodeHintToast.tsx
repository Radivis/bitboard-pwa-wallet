import { useEffect } from 'react'
import { toast } from 'sonner'
import { getAppLastOpenedAt, touchAppLastOpenedAt } from '@/lib/app-session-metadata'
import { getInfomodeHintKind } from '@/lib/infomode-hint-logic'

/** One intro/reminder per browser tab session (reload in same tab does not repeat). */
const SESSION_STORAGE_KEY = 'bitboard_infomode_hint_shown'

/** Long enough to read without rushing; Sonner dismiss or action still available. */
const INFOMODE_HINT_TOAST_DURATION_MS = 45_000

/**
 * On first load after DB is ready: optionally show Infomode intro or “away for a week” reminder,
 * then always persist last-opened time in wallet settings.
 */
export function InfomodeHintToast() {
  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const now = new Date()
        const nowIso = now.toISOString()

        const alreadyShownThisSession =
          typeof sessionStorage !== 'undefined' &&
          sessionStorage.getItem(SESSION_STORAGE_KEY) === '1'

        if (alreadyShownThisSession) {
          if (!cancelled) await touchAppLastOpenedAt(nowIso)
          return
        }

        const lastOpened = await getAppLastOpenedAt()
        if (cancelled) return

        const kind = getInfomodeHintKind(lastOpened, now.getTime())

        if (kind === 'intro') {
          toast.message('Try Infomode', {
            description:
              'Tap the lightbulb next to the theme control in the header. When it’s on, highlighted areas explain wallet concepts—tap a highlight to read a short popup.',
            duration: INFOMODE_HINT_TOAST_DURATION_MS,
          })
        } else if (kind === 'reminder') {
          toast.message('Welcome back', {
            description:
              'It’s been a while. Turn on Infomode with the header lightbulb anytime you want contextual explanations around the app.',
            duration: INFOMODE_HINT_TOAST_DURATION_MS,
          })
        }

        if (kind !== 'none' && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(SESSION_STORAGE_KEY, '1')
        }

        if (!cancelled) await touchAppLastOpenedAt(nowIso)
      } catch {
        // DB unavailable or other failure — skip nudge and do not block the app
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}

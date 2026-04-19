import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import { useLegalNoticeDisplay } from '@/lib/legal-notice-display'

/** Legal notice (Impressum / Legal notice) from repo-root `.env.legal-notice.*` at build time. */
export function LegalNoticeCard() {
  const display = useLegalNoticeDisplay()
  if (!display.visible) return null

  const { title, body, showSwitcher, activeLocale, setLocale } = display

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle className="leading-tight">{title}</CardTitle>
        {showSwitcher ? (
          <LegalLocaleSwitcher
            activeLocale={activeLocale}
            onLocaleChange={setLocale}
            ariaLabel="Legal notice language"
          />
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  )
}

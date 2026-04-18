import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  LEGAL_NOTICE_FLAG_DE,
  LEGAL_NOTICE_FLAG_EN,
} from '@/lib/legal-locale'
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
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Legal notice language"
          >
            <Button
              type="button"
              variant={activeLocale === 'de' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setLocale('de')}
              aria-pressed={activeLocale === 'de'}
            >
              <span aria-hidden>{LEGAL_NOTICE_FLAG_DE}</span>
              Deutsch
            </Button>
            <Button
              type="button"
              variant={activeLocale === 'en' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setLocale('en')}
              aria-pressed={activeLocale === 'en'}
            >
              <span aria-hidden>{LEGAL_NOTICE_FLAG_EN}</span>
              English
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  )
}

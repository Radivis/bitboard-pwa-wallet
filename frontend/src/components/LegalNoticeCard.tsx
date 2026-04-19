import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LegalEntityFields } from '@/components/LegalEntityFields'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import { useLegalNoticeDisplay } from '@/lib/legal-notice-display'

/** Legal notice: localized copy in `locales/{de|en}/legal.json`, entity in `legal-entity/entity.json`. */
export function LegalNoticeCard() {
  const display = useLegalNoticeDisplay()
  if (!display.visible) return null

  const { title, body, entity, showSwitcher, activeLocale, setLocale } = display

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
      <CardContent className="space-y-3">
        <LegalEntityFields entity={entity} className="space-y-1" />
        {body.trim() ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

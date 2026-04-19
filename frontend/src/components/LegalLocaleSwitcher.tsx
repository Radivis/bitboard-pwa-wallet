import { Button } from '@/components/ui/button'
import {
  LEGAL_NOTICE_FLAG_DE,
  LEGAL_NOTICE_FLAG_EN,
  type LegalLocale,
} from '@/lib/legal-locale'

export function LegalLocaleSwitcher({
  activeLocale,
  onLocaleChange,
  ariaLabel,
}: {
  activeLocale: LegalLocale
  onLocaleChange: (locale: LegalLocale) => void
  ariaLabel: string
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        type="button"
        variant={activeLocale === 'de' ? 'default' : 'outline'}
        size="sm"
        className="gap-1.5"
        onClick={() => onLocaleChange('de')}
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
        onClick={() => onLocaleChange('en')}
        aria-pressed={activeLocale === 'en'}
      >
        <span aria-hidden>{LEGAL_NOTICE_FLAG_EN}</span>
        English
      </Button>
    </div>
  )
}

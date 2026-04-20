import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import { LegalHubSections } from '@common/legal/LegalHubSections'
import {
  LEGAL_HUB_TITLE_DE,
  LEGAL_HUB_TITLE_EN,
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  useLegalLocale,
} from '@/lib/legal-locale'

/** Legal hub: imprint, privacy policy link, non-custodial disclaimer (`common/legal/`). */
export function LegalNoticeCard() {
  const { locale, setLocale } = useLegalLocale()

  const hubTitle = locale === 'de' ? LEGAL_HUB_TITLE_DE : LEGAL_HUB_TITLE_EN
  const privacyLinkLabel =
    locale === 'de' ? PRIVACY_PAGE_TITLE_DE : PRIVACY_PAGE_TITLE_EN

  return (
    <Card id="legal-notice">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle className="leading-tight">{hubTitle}</CardTitle>
        <LegalLocaleSwitcher
          activeLocale={locale}
          onLocaleChange={setLocale}
          ariaLabel="Legal notice language"
        />
      </CardHeader>
      <CardContent>
        <LegalHubSections
          locale={locale}
          surface="app"
          privacyLink={
            <Link
              to="/privacy"
              className="text-primary underline underline-offset-4 hover:opacity-90"
            >
              {privacyLinkLabel}
            </Link>
          }
        />
      </CardContent>
    </Card>
  )
}

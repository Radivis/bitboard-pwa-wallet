import { Link } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import { LegalNoticeDe } from '@common/legal/LegalNoticeDe'
import { LegalNoticeEn } from '@common/legal/LegalNoticeEn'
import {
  LEGAL_NOTICE_TITLE_DE,
  LEGAL_NOTICE_TITLE_EN,
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  useLegalLocale,
} from '@/lib/legal-locale'

/** Legal notice: per-locale TSX in `common/legal/`, entity in `legal-entity/entity.json`. */
export function LegalNoticeCard() {
  const { locale, setLocale } = useLegalLocale()

  const title = locale === 'de' ? LEGAL_NOTICE_TITLE_DE : LEGAL_NOTICE_TITLE_EN
  const privacyLinkLabel =
    locale === 'de' ? PRIVACY_PAGE_TITLE_DE : PRIVACY_PAGE_TITLE_EN

  return (
    <Card id="legal-notice">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <CardTitle className="leading-tight">{title}</CardTitle>
        <LegalLocaleSwitcher
          activeLocale={locale}
          onLocaleChange={setLocale}
          ariaLabel="Legal notice language"
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {locale === 'de' ? (
          <LegalNoticeDe surface="app" />
        ) : (
          <LegalNoticeEn surface="app" />
        )}
        <p className="pt-1 text-sm">
          <Link
            to="/privacy"
            className="text-primary underline underline-offset-4 hover:opacity-90"
          >
            {privacyLinkLabel}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

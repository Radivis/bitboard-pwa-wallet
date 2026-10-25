import { Link } from '@tanstack/react-router'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import { LegalHubSections } from '@common/legal/LegalHubSections'
import {
  LEGAL_HUB_TITLE_DE,
  LEGAL_HUB_TITLE_EN,
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  useLegalLocale,
} from '@/lib/shared/legal-locale'

/** Legal hub: imprint, privacy policy link, non-custodial disclaimer (`common/legal/`). */
export function LegalNoticeCard() {
  const { locale, setLocale } = useLegalLocale()

  const hubTitle = locale === 'de' ? LEGAL_HUB_TITLE_DE : LEGAL_HUB_TITLE_EN
  const privacyLinkLabel =
    locale === 'de' ? PRIVACY_PAGE_TITLE_DE : PRIVACY_PAGE_TITLE_EN

  return (
    <DesignCard id="legal-notice">
      <DesignCardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <DesignCardTitle>{hubTitle}</DesignCardTitle>
        <LegalLocaleSwitcher
          activeLocale={locale}
          onLocaleChange={setLocale}
          ariaLabel="Legal notice language"
        />
      </DesignCardHeader>
      <DesignCardContent>
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
      </DesignCardContent>
    </DesignCard>
  )
}

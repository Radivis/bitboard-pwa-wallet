import type { ReactNode } from 'react'
import {
  DISCLAIMER_BODY_DE,
  DISCLAIMER_BODY_EN,
  LEGAL_NOTICE_TITLE_DE,
  LEGAL_NOTICE_TITLE_EN,
  LEGAL_SUBSECTION_DISCLAIMER_DE,
  LEGAL_SUBSECTION_DISCLAIMER_EN,
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  type LegalLocale,
} from '@legal-locale'
import { LegalNoticeDe } from './LegalNoticeDe'
import { LegalNoticeEn } from './LegalNoticeEn'

type LegalHubSectionsProps = {
  locale: LegalLocale
  surface: 'app' | 'landing'
  /** Renders the privacy-policy link (TanStack `Link` in the app, `<a href="…">` on the marketing site). */
  privacyLink: ReactNode
}

export function LegalHubSections({ locale, surface, privacyLink }: LegalHubSectionsProps) {
  const isDe = locale === 'de'
  const imprintTitle = isDe ? LEGAL_NOTICE_TITLE_DE : LEGAL_NOTICE_TITLE_EN
  const privacyHeading = isDe ? PRIVACY_PAGE_TITLE_DE : PRIVACY_PAGE_TITLE_EN
  const disclaimerHeading = isDe ? LEGAL_SUBSECTION_DISCLAIMER_DE : LEGAL_SUBSECTION_DISCLAIMER_EN
  const disclaimerBody = isDe ? DISCLAIMER_BODY_DE : DISCLAIMER_BODY_EN

  const isLanding = surface === 'landing'
  const sectionHeadingClass = isLanding
    ? 'mb-2 text-sm font-semibold text-gray-300'
    : 'mb-2 text-sm font-semibold text-foreground'
  const disclaimerBodyClass = isLanding
    ? 'text-sm text-gray-400'
    : 'text-sm text-muted-foreground'

  return (
    <div className="space-y-6">
      <section aria-labelledby="legal-hub-imprint-heading">
        <h3 id="legal-hub-imprint-heading" className={sectionHeadingClass}>
          {imprintTitle}
        </h3>
        {isDe ? <LegalNoticeDe surface={surface} /> : <LegalNoticeEn surface={surface} />}
      </section>
      <section aria-labelledby="legal-hub-privacy-heading">
        <h3 id="legal-hub-privacy-heading" className={sectionHeadingClass}>
          {privacyHeading}
        </h3>
        {privacyLink}
      </section>
      <section aria-labelledby="legal-hub-disclaimer-heading">
        <h3 id="legal-hub-disclaimer-heading" className={sectionHeadingClass}>
          {disclaimerHeading}
        </h3>
        <p className={disclaimerBodyClass}>{disclaimerBody}</p>
      </section>
    </div>
  )
}

/**
 * Privacy policy body lives in `PrivacyPolicyDe` / `PrivacyPolicyEn` (locale documents).
 * Broader i18next adoption elsewhere is planned where appropriate; legal prose stays
 * versioned per locale for clarity and review.
 */
import { createFileRoute } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import {
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  useLegalLocale,
} from '@/lib/legal-locale'
import {
  PRIVACY_SHARED_LANGUAGE_USER_NOTE_DE,
  PRIVACY_SHARED_LANGUAGE_USER_NOTE_EN,
} from '@common/privacy/privacy-language-notes'
import { PrivacyPolicyLayout } from '@common/privacy/PrivacyPolicyLayout'
import { PrivacyPolicyDe } from '@common/privacy/PrivacyPolicyDe'
import { PrivacyPolicyEn } from '@common/privacy/PrivacyPolicyEn'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

export function PrivacyPage() {
  const { locale, setLocale } = useLegalLocale()
  const title =
    locale === 'de' ? PRIVACY_PAGE_TITLE_DE : PRIVACY_PAGE_TITLE_EN
  const privacyLanguageNote =
    locale === 'de'
      ? PRIVACY_SHARED_LANGUAGE_USER_NOTE_DE
      : PRIVACY_SHARED_LANGUAGE_USER_NOTE_EN

  return (
    <div className="space-y-6">
      <PageHeader title={title} icon={Shield} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{privacyLanguageNote}</p>
        <LegalLocaleSwitcher
          activeLocale={locale}
          onLocaleChange={setLocale}
          ariaLabel="Privacy policy language"
        />
      </div>

      <PrivacyPolicyLayout surface="app">
        {locale === 'de' ? <PrivacyPolicyDe /> : <PrivacyPolicyEn />}
      </PrivacyPolicyLayout>
    </div>
  )
}

import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Shield } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { LegalLocaleSwitcher } from '@/components/LegalLocaleSwitcher'
import { legalI18n } from '@/i18n/legal-i18n'
import {
  PRIVACY_PAGE_TITLE_DE,
  PRIVACY_PAGE_TITLE_EN,
  useLegalLocale,
} from '@/lib/legal-locale'
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
  const tLegal = useMemo(
    () => legalI18n.getFixedT(locale, 'legal'),
    [locale],
  )

  return (
    <div className="space-y-6">
      <PageHeader title={title} icon={Shield} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {tLegal('privacySharedLanguageUserNote')}
        </p>
        <LegalLocaleSwitcher
          activeLocale={locale}
          onLocaleChange={setLocale}
          ariaLabel="Privacy policy language"
        />
      </div>

      <PrivacyPolicyLayout surface="app">
        {locale === 'de' ? <PrivacyPolicyDe /> : <PrivacyPolicyEn />}
      </PrivacyPolicyLayout>

      <p className="text-sm text-muted-foreground">
        <Link to="/settings" className="text-primary underline underline-offset-4">
          Back to Settings
        </Link>
      </p>
    </div>
  )
}

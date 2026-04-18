import { ArrowLeft } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { MatrixBackground } from '@/components/MatrixBackground';
import { LegalLocaleSwitcherLanding } from '@/src/components/LegalLocaleSwitcherLanding';
import { useLegalLocale } from '@legal-locale';
import { PrivacyPolicyLayout } from '@common/privacy/PrivacyPolicyLayout';
import { PrivacyPolicyDe } from '@common/privacy/PrivacyPolicyDe';
import { PrivacyPolicyEn } from '@common/privacy/PrivacyPolicyEn';

export function PrivacyLandingPage() {
  const prefersReducedMotion = useReducedMotion();
  const { locale, setLocale } = useLegalLocale();

  return (
    <div className="min-h-screen text-white font-sans relative overflow-x-hidden">
      <MatrixBackground reducedMotion={prefersReducedMotion ?? false} />

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to home
        </a>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end mb-6">
          <LegalLocaleSwitcherLanding
            activeLocale={locale}
            onLocaleChange={setLocale}
            ariaLabel="Privacy policy language"
          />
        </div>

        <PrivacyPolicyLayout surface="landing">
          {locale === 'de' ? <PrivacyPolicyDe /> : <PrivacyPolicyEn />}
        </PrivacyPolicyLayout>
      </div>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import {
  LEGAL_NOTICE_FLAG_DE,
  LEGAL_NOTICE_FLAG_EN,
  legalLocaleSwitcherLandingButtonClass,
  type LegalLocale,
} from '@legal-locale';

export function LegalLocaleSwitcherLanding({
  activeLocale,
  onLocaleChange,
  ariaLabel,
}: {
  activeLocale: LegalLocale;
  onLocaleChange: (locale: LegalLocale) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={legalLocaleSwitcherLandingButtonClass(activeLocale === 'de')}
        onClick={() => onLocaleChange('de')}
        aria-pressed={activeLocale === 'de'}
      >
        <span aria-hidden>{LEGAL_NOTICE_FLAG_DE}</span>
        Deutsch
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={legalLocaleSwitcherLandingButtonClass(activeLocale === 'en')}
        onClick={() => onLocaleChange('en')}
        aria-pressed={activeLocale === 'en'}
      >
        <span aria-hidden>{LEGAL_NOTICE_FLAG_EN}</span>
        English
      </Button>
    </div>
  );
}

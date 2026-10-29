import { ExternalLink } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { DesignNavStepper } from '@/components/design/DesignNavStepper'
import { DesignStepIndicator } from '@/components/design/DesignStepIndicator'
import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import type { ProgressStepLink } from '@/components/design/stepper-shared'
import { cn } from '@/lib/shared/utils'
import { EXCHANGE_GUIDE_STEPS, exchangeGuideStepContent } from '@/pages/guides/exchange-guide'
import {
  GUIDE_STEP_NAV_TOGGLE_SPACER_CLASS_NAME,
  GuideStepNavChrome,
  useGuideStepNavChrome,
} from '@/pages/guides/GuideStepNavChrome'

export function ExchangeGuideStepPage({ step }: { step: number }) {
  const content = exchangeGuideStepContent(step)
  const { hidden, navRef, toggleHidden, mainPaddingClassName } = useGuideStepNavChrome()

  return (
    <>
      <div className={cn('mx-auto flex w-full flex-col items-center gap-8', mainPaddingClassName)}>
        <header className="flex w-full max-w-xl flex-col items-center gap-3">
          <h2 className={cn(designTypeClassName.screenHeading, 'flex items-center gap-3 text-center')}>
            <ExternalLink className="size-6 shrink-0" aria-hidden />
            Exchanges Step By Step
          </h2>
          <DesignStepIndicator
            currentStep={content.step}
            totalSteps={EXCHANGE_GUIDE_STEPS.length}
          />
        </header>
        <h3
          className={cn(
            designTypeClassName.emphasis,
            'w-full max-w-xl text-center text-[var(--design-text-regular)]',
          )}
        >
          {content.title}
        </h3>
        <img
          src={content.comicSrc}
          alt={content.comicAlt}
          width={content.comicWidth}
          height={content.comicHeight}
          className="h-auto w-[min(var(--exchange-comic-width),calc(100vw-32px))] max-w-none rounded-[16px]"
          style={{ '--exchange-comic-width': `${content.comicWidth}px` } as CSSProperties}
        />
        <div
          className={cn(
            designTypeClassName.regular,
            'w-full max-w-xl space-y-4 px-0.5 text-[var(--design-text-regular)]',
          )}
        >
          {content.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {content.linkHref ? (
            <a
              href={content.linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'block text-[var(--design-status-info-description)]',
                designFocusClassName,
              )}
            >
              {content.linkHref}
            </a>
          ) : null}
        </div>
      </div>
      <GuideStepNavChrome hidden={hidden} navRef={navRef} onToggle={toggleHidden}>
        <DesignNavStepper
          currentStep={content.step}
          totalSteps={EXCHANGE_GUIDE_STEPS.length}
          renderStepLink={renderExchangeGuideStepLink}
          center={<div className={GUIDE_STEP_NAV_TOGGLE_SPACER_CLASS_NAME} aria-hidden />}
        />
      </GuideStepNavChrome>
    </>
  )
}

function renderExchangeGuideStepLink({ step, label, icon }: ProgressStepLink) {
  return (
    <Link
      to="/guides/how-to-get-bitcoin/exchanges/$step"
      params={{ step: String(step) }}
      replace
      aria-label={label}
    >
      {icon}
    </Link>
  )
}

import { ExternalLink } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { ProgressStepper, type ProgressStepLink } from '@/components/design/ProgressStepper'
import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'
import { EXCHANGE_GUIDE_STEPS, exchangeGuideStepContent } from '@/pages/guides/exchange-guide'

export function ExchangeGuideStepPage({ step }: { step: number }) {
  const content = exchangeGuideStepContent(step)

  return (
    <div className="mx-auto flex w-full flex-col items-center gap-4">
      <header className="flex w-full max-w-xl flex-col items-center gap-3">
        <h2 className={cn(designTypeClassName.screenHeading, 'flex items-center gap-3 text-center')}>
          <ExternalLink className="size-6 shrink-0" aria-hidden />
          Exchanges Step By Step
        </h2>
        <ProgressStepper
          currentStep={content.step}
          totalSteps={EXCHANGE_GUIDE_STEPS.length}
          renderStepLink={renderExchangeGuideStepLink}
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
      <div
        className={cn(
          designTypeClassName.regular,
          'w-full max-w-xl text-[var(--design-text-regular)]',
        )}
      >
        <p>{content.body}</p>
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
      <img
        src={content.comicSrc}
        alt={content.comicAlt}
        width={content.comicWidth}
        height={content.comicHeight}
        className="h-auto w-[min(var(--exchange-comic-width),calc(100vw-32px))] max-w-none"
        style={{ '--exchange-comic-width': `${content.comicWidth}px` } as CSSProperties}
      />
    </div>
  )
}

function renderExchangeGuideStepLink({ step, label, icon }: ProgressStepLink) {
  return (
    <Link
      to="/guides/how-to-get-bitcoin/exchanges/$step"
      params={{ step: String(step) }}
      aria-label={label}
    >
      {icon}
    </Link>
  )
}

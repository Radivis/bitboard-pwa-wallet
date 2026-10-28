import { ExternalLink, Play } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { DesignButton } from '@/components/design/DesignButton'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'
import { EXCHANGE_GUIDE_INTRO_PARAGRAPHS } from '@/pages/guides/exchange-guide'

export function ExchangeGuideIntroPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8">
      <h2 className={cn(designTypeClassName.screenHeading, 'flex items-center gap-3 text-center')}>
        <ExternalLink className="size-6 shrink-0" aria-hidden />
        Exchanges
      </h2>
      <div
        className={cn(
          designTypeClassName.regular,
          'w-full max-w-80 space-y-4 text-[var(--design-text-regular)]',
        )}
      >
        {EXCHANGE_GUIDE_INTRO_PARAGRAPHS.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <DesignButton asChild className="w-full max-w-[18.625rem]">
        <Link to="/guides/how-to-get-bitcoin/exchanges/$step" params={{ step: '1' }} replace>
          <Play aria-hidden />
          Step by Step Guide
        </Link>
      </DesignButton>
    </div>
  )
}

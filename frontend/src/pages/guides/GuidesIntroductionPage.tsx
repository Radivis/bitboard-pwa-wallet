import { Play } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AppHero } from '@/components/AppHero'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'
import { INTRODUCTION_AREAS } from '@/pages/guides/introduction-areas'

export function GuidesIntroductionPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8">
      <AppHero />
      <div
        className={cn(
          designTypeClassName.regular,
          'w-full max-w-80 space-y-4 text-[var(--design-text-regular)]',
        )}
      >
        <p>Bitcoin Codex is first and foremost about learning how Bitcoin and self-custody work.</p>
        <p>There are five areas in this app, which you can switch between via the hamburger menu:</p>
      </div>
      <div className="flex w-full flex-col gap-8">
        {INTRODUCTION_AREAS.map((area) => (
          <DesignCard key={area.title}>
            <DesignCardHeader>
              <DesignCardTitle>{area.title}</DesignCardTitle>
              <DesignCardDescription>{area.description}</DesignCardDescription>
            </DesignCardHeader>
            <DesignCardContent>
              <DesignButton asChild className="w-full">
                <Link to={area.to}>
                  <Play aria-hidden />
                  {area.learnMoreLabel}
                </Link>
              </DesignButton>
            </DesignCardContent>
          </DesignCard>
        ))}
      </div>
    </div>
  )
}

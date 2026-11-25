import { ArrowLeft, Bitcoin } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { DesignButton } from '@/components/design/DesignButton'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'
import { GUIDE_AREA_INTRODUCTIONS } from '@/pages/guides/guide-area-introductions'

interface GuideAreaIntroductionPageProps {
  title: string
  paragraphs: readonly string[]
}

export function GuideAreaIntroduction({
  area,
}: {
  area: keyof typeof GUIDE_AREA_INTRODUCTIONS
}) {
  const introduction = GUIDE_AREA_INTRODUCTIONS[area]
  return (
    <GuideAreaIntroductionPage
      title={introduction.title}
      paragraphs={introduction.paragraphs}
    />
  )
}

export function GuideAreaIntroductionPage({ title, paragraphs }: GuideAreaIntroductionPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8">
      <h2 className={cn(designTypeClassName.areaHeading, 'text-center')}>{title}</h2>
      <div
        className={cn(
          designTypeClassName.regular,
          'w-full max-w-80 space-y-4 text-[var(--design-text-regular)]',
        )}
      >
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="flex w-full max-w-[19.375rem] flex-col items-stretch gap-8">
        <DesignButton appearance="secondary" asChild className="w-full">
          <Link to="/guides/introduction">
            <ArrowLeft aria-hidden />
            Back
          </Link>
        </DesignButton>
        <DesignButton asChild className="w-full">
          <Link to="/">
            <Bitcoin aria-hidden />
            Let’s go to the actual app
          </Link>
        </DesignButton>
      </div>
    </div>
  )
}

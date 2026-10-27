import { CircleDollarSign, Signpost, Sparkles } from 'lucide-react'
import { DesignCardButton } from '@/components/design/DesignCardButton'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

export function GuidesIndexPage() {
  return (
    <div className="flex flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <h2 className={cn(designTypeClassName.areaHeading, 'flex items-center gap-3')}>
          <Signpost className="size-8 shrink-0" aria-hidden />
          Guides
        </h2>
        <p className={cn(designTypeClassName.regular, 'text-[var(--design-text-subdued)]')}>
          Practical step by step instructions
        </p>
      </header>
      <nav aria-label="Guides" className="flex w-full flex-col gap-6">
        <DesignCardButton to="/guides/how-to-get-bitcoin" icon={CircleDollarSign}>
          How to get Bitcoin
        </DesignCardButton>
        <DesignCardButton to="/guides/introduction" icon={Sparkles}>
          Introduction
        </DesignCardButton>
      </nav>
    </div>
  )
}

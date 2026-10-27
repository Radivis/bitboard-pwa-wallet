import { CircleDollarSign, Play } from 'lucide-react'
import { DesignButton, type DesignButtonAppearance } from '@/components/design/DesignButton'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

const HOW_TO_GET_BITCOIN_OPTIONS: {
  label: string
  appearance: DesignButtonAppearance
}[] = [
  { label: 'Exchanges', appearance: 'primary' },
  { label: 'Apps', appearance: 'primary' },
  { label: 'People', appearance: 'secondary' },
  { label: 'Bitcoin ATMs', appearance: 'secondary' },
  { label: 'Mining', appearance: 'tertiary' },
]

export function HowToGetBitcoinPage() {
  return (
    <div className="flex flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <h2 className={cn(designTypeClassName.screenHeading, 'flex items-center gap-3')}>
          <CircleDollarSign className="size-6 shrink-0" aria-hidden />
          How to get Bitcoin
        </h2>
        <p className={cn(designTypeClassName.regular, 'text-[var(--design-text-subdued)]')}>
          From easiest to hardest
        </p>
      </header>
      <div className="flex flex-col items-center gap-4">
        {HOW_TO_GET_BITCOIN_OPTIONS.map((option) => (
          <DesignButton
            key={option.label}
            appearance={option.appearance}
            icon={<Play aria-hidden />}
          >
            {option.label}
          </DesignButton>
        ))}
      </div>
    </div>
  )
}

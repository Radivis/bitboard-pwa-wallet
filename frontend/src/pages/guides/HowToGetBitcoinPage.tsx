import { CircleDollarSign, Play } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { DesignButton, type DesignButtonAppearance } from '@/components/design/DesignButton'
import { DesignCard, DesignCardContent, DesignCardHeader, DesignCardTitle } from '@/components/design/DesignCard'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

interface HowToGetBitcoinOption {
  label: string
  appearance: DesignButtonAppearance
  to?: '/guides/how-to-get-bitcoin/exchanges'
}

const HOW_TO_GET_BITCOIN_GROUPS: {
  title: string
  options: HowToGetBitcoinOption[]
}[] = [
  {
    title: 'Typically requiring KYC procedures',
    options: [
      { label: 'Exchanges', appearance: 'primary', to: '/guides/how-to-get-bitcoin/exchanges' },
      { label: 'Apps', appearance: 'primary' },
    ],
  },
  {
    title: 'Depending on your location',
    options: [
      { label: 'People', appearance: 'secondary' },
      { label: 'Bitcoin ATMs', appearance: 'secondary' },
    ],
  },
  {
    title: 'For truly dedicated people',
    options: [{ label: 'Mining', appearance: 'tertiary' }],
  },
]

function HowToGetBitcoinChoice({ option }: { option: HowToGetBitcoinOption }) {
  if (option.to) {
    return (
      <DesignButton asChild appearance={option.appearance} className="w-full">
        <Link to={option.to}>
          <Play aria-hidden />
          {option.label}
        </Link>
      </DesignButton>
    )
  }

  return (
    <DesignButton
      appearance={option.appearance}
      className="w-full"
      icon={<Play aria-hidden />}
    >
      {option.label}
    </DesignButton>
  )
}

export function HowToGetBitcoinPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <h2 className={cn(designTypeClassName.screenHeading, 'flex items-center gap-3')}>
          <CircleDollarSign className="size-6 shrink-0" aria-hidden />
          How to get Bitcoin
        </h2>
        <p className={cn(designTypeClassName.regular, 'text-[var(--design-text-subdued)]')}>
          From easiest to hardest
        </p>
      </header>
      <div className="flex w-full flex-col gap-4">
        {HOW_TO_GET_BITCOIN_GROUPS.map((group) => (
          <DesignCard key={group.title}>
            <DesignCardHeader>
              <DesignCardTitle>{group.title}</DesignCardTitle>
            </DesignCardHeader>
            <DesignCardContent className="gap-[15px]">
              {group.options.map((option) => (
                <HowToGetBitcoinChoice key={option.label} option={option} />
              ))}
            </DesignCardContent>
          </DesignCard>
        ))}
      </div>
    </div>
  )
}

import type { ComponentProps } from 'react'
import { Check } from 'lucide-react'

import { cn } from '@/lib/shared/utils'

const boxClassName =
  'pointer-events-none size-8 rounded-[8px] border-2 border-[var(--design-accent-secondary-stroke)] bg-transparent transition-[background-color,border-color] duration-200 ease-out motion-reduce:transition-none peer-checked:border-transparent peer-checked:bg-[var(--design-accent-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--design-focus-ring)]'

const iconClassName =
  'pointer-events-none absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-[var(--design-text-button)] opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none peer-checked:opacity-100'

export function DesignCheckbox({ className, ...props }: ComponentProps<'input'>) {
  return (
    <span
      data-slot="design-checkbox"
      className={cn(
        'relative inline-flex size-12 shrink-0 items-center justify-center has-[:disabled]:opacity-50',
        className,
      )}
    >
      <input
        className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        {...props}
        type="checkbox"
      />
      <span aria-hidden className={boxClassName} />
      <Check aria-hidden strokeWidth={3} className={iconClassName} />
    </span>
  )
}

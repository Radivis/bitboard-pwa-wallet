import * as React from 'react'
import { CircleQuestionMark } from 'lucide-react'

import { cn } from '@/lib/shared/utils'
import { designFocusClassName } from '@/components/design/design-classes'

export function DesignInfoToggle({
  pressed,
  className,
  iconClassName,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> & {
  pressed: boolean
  iconClassName?: string
}) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      data-slot="design-info-toggle"
      data-status={pressed ? 'active' : 'inactive'}
      className={cn(
        'design-ui inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--design-text-regular)]',
        designFocusClassName,
        className,
      )}
      {...props}
    >
      <span
        data-slot="design-info-toggle-plate"
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-in-out',
          pressed
            ? 'bg-[color-mix(in_srgb,var(--design-text-regular)_50%,transparent)]'
            : 'bg-transparent',
          iconClassName,
        )}
      >
        <CircleQuestionMark className="size-6" aria-hidden />
      </span>
    </button>
  )
}

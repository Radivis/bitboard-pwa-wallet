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
        'design-ui inline-flex size-12 shrink-0 items-center justify-center rounded-full',
        designFocusClassName,
        pressed
          ? 'text-[var(--design-text-regular)]'
          : 'text-[var(--design-input-placeholder)]',
        className,
      )}
      {...props}
    >
      <span className={cn('inline-flex', iconClassName)}>
        <CircleQuestionMark className="size-6" aria-hidden />
      </span>
    </button>
  )
}

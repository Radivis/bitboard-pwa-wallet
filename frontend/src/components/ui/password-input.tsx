/* eslint-disable react-refresh/only-export-components -- PasswordKind and PASSWORD_KINDS are part of the public API */
import * as React from 'react'

import { DesignInput } from '@/components/design/DesignInput'
import { cn } from '@/lib/shared/utils'

export const PASSWORD_KINDS = ['app', 'export'] as const
export type PasswordKind = (typeof PASSWORD_KINDS)[number]

export type PasswordInputProps = Omit<
  React.ComponentProps<typeof DesignInput>,
  'type' | 'name' | 'autoComplete'
> & {
  passwordKind: PasswordKind
  /** When set, `name` becomes `${passwordKind}-${nameSuffix}` so multiple fields in one form stay distinct. */
  nameSuffix?: string
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { passwordKind, nameSuffix, className, 'aria-describedby': ariaDescribedByProp, ...props },
    ref,
  ) {
    const descriptionId = React.useId()
    const name = nameSuffix ? `${passwordKind}-${nameSuffix}` : passwordKind
    const ariaDescribedBy = [descriptionId, ariaDescribedByProp].filter(Boolean).join(' ').trim() || undefined

    return (
      <div className={cn('w-full', className)}>
        <span id={descriptionId} className="sr-only">
          This is a secure password field. Characters are hidden from view while you type.
        </span>
        <DesignInput
          {...props}
          ref={ref}
          type="password"
          name={name}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          aria-describedby={ariaDescribedBy}
          className="w-full"
        />
      </div>
    )
  },
)

PasswordInput.displayName = 'PasswordInput'

/* eslint-disable react-refresh/only-export-components -- PasswordKind and PASSWORD_KINDS are part of the public API */
import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const PASSWORD_KINDS = ['app', 'export'] as const
export type PasswordKind = (typeof PASSWORD_KINDS)[number]

export type PasswordInputProps = Omit<
  React.ComponentProps<typeof Input>,
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
    const [showPassword, setShowPassword] = React.useState(false)
    const descriptionId = React.useId()
    const name = nameSuffix ? `${passwordKind}-${nameSuffix}` : passwordKind
    const ariaDescribedBy = [descriptionId, ariaDescribedByProp].filter(Boolean).join(' ').trim() || undefined

    return (
      <div className="relative w-full">
        <span id={descriptionId} className="sr-only">
          This is a secure password field. Characters are hidden from view while you type.
        </span>
        <Input
          {...props}
          ref={ref}
          type="text"
          name={name}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          aria-describedby={ariaDescribedBy}
          className={cn(
            'pr-10',
            showPassword ? '[-webkit-text-security:none]' : '[-webkit-text-security:disc]',
            className,
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </Button>
      </div>
    )
  },
)

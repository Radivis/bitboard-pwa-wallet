import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { useResolvedTheme } from '@/stores/themeStore'

const TOAST_BELOW_HEADER_OFFSET = { top: 'var(--toast-top-offset)' } as const

const statusClassName = {
  success:
    'border-[var(--design-status-success-stroke)] bg-[var(--design-status-success-surface)] text-[var(--design-status-success-foreground)]',
  error:
    'border-[var(--design-status-error-stroke)] bg-[var(--design-status-error-surface)] text-[var(--design-status-error-foreground)]',
  warning:
    'border-[var(--design-status-warning-stroke)] bg-[var(--design-status-warning-surface)] text-[var(--design-status-warning-foreground)]',
  info:
    'border-[var(--design-status-info-stroke)] bg-[var(--design-status-info-surface)] text-[var(--design-status-info-foreground)]',
} as const

export function DesignToaster({ ...props }: ToasterProps) {
  const resolvedTheme = useResolvedTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      closeButton
      offset={TOAST_BELOW_HEADER_OFFSET}
      mobileOffset={TOAST_BELOW_HEADER_OFFSET}
      toastOptions={{
        closeButtonAriaLabel: 'Close',
        classNames: {
          toast: 'design-ui rounded-[16px] border',
          title: 'text-base font-semibold',
          description: 'text-base font-normal',
          ...statusClassName,
        },
      }}
      icons={{
        success: <CircleCheck className="size-6" />,
        info: <Info className="size-6" />,
        warning: <TriangleAlert className="size-6" />,
        error: <CircleX className="size-6" />,
        loading: <Loader2 className="size-6 animate-spin" />,
      }}
      {...props}
    />
  )
}

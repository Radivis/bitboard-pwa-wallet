import { CircleCheck, CircleX, Info, Loader2, TriangleAlert, X } from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

import { cn } from '@/lib/shared/utils'
import { useResolvedTheme } from '@/stores/themeStore'

const TOAST_BELOW_HEADER_OFFSET = { top: 'var(--toast-top-offset)' } as const

export function DesignToaster({ className, toastOptions, ...props }: ToasterProps) {
  const resolvedTheme = useResolvedTheme()

  return (
    <Sonner
      {...props}
      theme={resolvedTheme}
      className={cn('design-toaster', className)}
      closeButton
      offset={TOAST_BELOW_HEADER_OFFSET}
      mobileOffset={TOAST_BELOW_HEADER_OFFSET}
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        closeButtonAriaLabel: 'Close',
        classNames: {
          toast:
            'design-ui flex w-[var(--width)] items-center gap-2 rounded-[16px] border px-4 py-2',
          title: 'text-base font-semibold',
          description: 'text-base font-normal',
          content: 'flex min-w-0 flex-1 flex-col gap-1',
          icon: 'flex shrink-0 items-center self-center',
          closeButton:
            'order-last inline-flex size-5 shrink-0 items-center justify-center self-center border-0 bg-transparent p-0 text-inherit',
          actionButton:
            'shrink-0 border-0 bg-transparent p-0 text-base font-semibold text-[var(--design-accent-secondary)]',
          ...toastOptions?.classNames,
        },
      }}
      icons={{
        success: <CircleCheck className="size-6" aria-hidden />,
        info: <Info className="size-6" aria-hidden />,
        warning: <TriangleAlert className="size-6" aria-hidden />,
        error: <CircleX className="size-6" aria-hidden />,
        loading: <Loader2 className="size-6 animate-spin" aria-hidden />,
        close: <X className="size-3.5" aria-hidden />,
      }}
    />
  )
}

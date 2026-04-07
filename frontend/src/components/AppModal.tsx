import * as React from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { InfomodeModalToggleCapsule } from '@/components/infomode/InfomodeModalToggleCapsule'

export function AppModalFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex w-full flex-row flex-wrap items-center justify-between gap-4',
        className,
      )}
      {...props}
    />
  )
}

export type AppModalRequestClose = () => void

export interface AppModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Visible dialog title (not the HTML `title` attribute — avoids clashing with `DialogContent`). */
  title: React.ReactNode
  /** Invoked when the dialog closes via X, overlay, Escape, or explicit requestClose from footer/children. */
  onCancel: () => void
  children:
    | React.ReactNode
    | ((requestClose: AppModalRequestClose) => React.ReactNode)
  footer?:
    | React.ReactNode
    | ((requestClose: AppModalRequestClose) => React.ReactNode)
  blockDismiss?: boolean
  /** When true, the header close (X) control is not rendered (overlay/Escape still follow blockDismiss). */
  hideCloseButton?: boolean
  closeAriaLabel?: string
  contentClassName?: string
  /** Passed to Radix Dialog root (default true). */
  modal?: boolean
  /** Merged into the wrapper around `footer` (e.g. `justify-end` for a single action). */
  footerClassName?: string
}

/**
 * Standard app dialog: header row (title + Infomode + close), full-width body, optional footer.
 * Close paths call onCancel once, then onOpenChange(false), except when blockDismiss is true.
 */
export function AppModal({
  open,
  onOpenChange,
  title,
  onCancel,
  children,
  footer,
  blockDismiss = false,
  hideCloseButton = false,
  closeAriaLabel = 'Close',
  contentClassName,
  modal = true,
  footerClassName,
  ...dialogContentProps
}: AppModalProps &
  Omit<
    React.ComponentProps<typeof DialogContent>,
    'children' | 'className' | 'showCloseButton' | 'title'
  >) {
  const {
    onInteractOutside: onInteractOutsideFromProps,
    onEscapeKeyDown: onEscapeKeyDownFromProps,
    ...restDialogContentProps
  } = dialogContentProps

  const handleOpenChange = (next: boolean) => {
    if (!next && blockDismiss) {
      return
    }
    if (!next) {
      onCancel()
    }
    onOpenChange(next)
  }

  const requestClose: AppModalRequestClose = () => {
    handleOpenChange(false)
  }

  const body =
    typeof children === 'function' ? children(requestClose) : children
  const footerNode =
    typeof footer === 'function' ? footer(requestClose) : footer

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal={modal}>
      <DialogContent
        showCloseButton={false}
        className={cn('gap-0 p-6 sm:max-w-lg', contentClassName)}
        onInteractOutside={(e) => {
          if (blockDismiss) e.preventDefault()
          onInteractOutsideFromProps?.(e)
        }}
        onEscapeKeyDown={(e) => {
          if (blockDismiss) e.preventDefault()
          onEscapeKeyDownFromProps?.(e)
        }}
        {...restDialogContentProps}
      >
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="flex w-full min-w-0 flex-row items-start gap-3">
            <DialogHeader className="min-w-0 flex-1 space-y-0 p-0 text-left">
              <DialogTitle asChild>
                <h2 className="flex min-w-0 items-start gap-2 text-left text-lg leading-tight font-semibold">
                  {title}
                </h2>
              </DialogTitle>
            </DialogHeader>
            <div className="flex shrink-0 items-center gap-2">
              <InfomodeModalToggleCapsule />
              {!hideCloseButton && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 opacity-70 ring-offset-background hover:opacity-100"
                  aria-label={closeAriaLabel}
                  disabled={blockDismiss}
                  onClick={requestClose}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="w-full min-w-0">{body}</div>

          {footerNode != null ? (
            <AppModalFooter className={footerClassName}>{footerNode}</AppModalFooter>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

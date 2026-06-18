import * as React from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/shared/utils'
import { InfomodeModalToggleCapsule } from '@/components/infomode/InfomodeModalToggleCapsule'

/** Tall modals must scroll inside the panel — Radix locks document scroll while open. */
const APP_MODAL_MAX_HEIGHT_CLASS = 'max-h-[min(90dvh,calc(100vh-2rem))]'

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
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
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
  isBlockDismissed?: boolean
  /** When true, the header close (X) control is not rendered (overlay/Escape still follow blockDismiss). */
  isCloseButtonHidden?: boolean
  closeAriaLabel?: string
  contentClassName?: string
  /** Passed to Radix Dialog root as argument "modal"(default true). */
  isModal?: boolean
  /** Merged into the wrapper around `footer` (e.g. `justify-end` for a single action). */
  footerClassName?: string
}

/**
 * Standard app dialog: header row (title + Infomode + close), full-width body, optional footer.
 * Close paths call onCancel once, then onOpenChange(false), except when blockDismiss is true.
 *
 * **Controlled usage:** Some parents pass `onOpenChange={() => {}}` and rely on `onCancel` to
 * update local `open` state (e.g. clear form + `setOpen(false)`). That matches this component’s
 * close order; if you only no-op `onCancel`, the dialog can stay open incorrectly.
 */
export function AppModal({
  isOpen,
  onOpenChange,
  title,
  onCancel,
  children,
  footer,
  isBlockDismissed = false,
  isCloseButtonHidden = false,
  closeAriaLabel = 'Close',
  contentClassName,
  isModal = true,
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
    if (!next && isBlockDismissed) {
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
    <Dialog open={isOpen} onOpenChange={handleOpenChange} modal={isModal}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          contentClassName,
          'flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg',
          APP_MODAL_MAX_HEIGHT_CLASS,
        )}
        onInteractOutside={(e) => {
          if (isBlockDismissed) e.preventDefault()
          onInteractOutsideFromProps?.(e)
        }}
        onEscapeKeyDown={(e) => {
          if (isBlockDismissed) e.preventDefault()
          onEscapeKeyDownFromProps?.(e)
        }}
        {...restDialogContentProps}
      >
        <div className="flex w-full min-w-0 shrink-0 flex-row items-start gap-3 p-6 pb-4">
          <DialogHeader className="min-w-0 flex-1 space-y-0 p-0 text-left">
            <DialogTitle asChild>
              <h2 className="flex min-w-0 items-start gap-2 text-left text-lg leading-tight font-semibold">
                {title}
              </h2>
            </DialogTitle>
          </DialogHeader>
          <div className="flex shrink-0 items-center gap-2">
            <InfomodeModalToggleCapsule />
            {!isCloseButtonHidden && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 opacity-70 ring-offset-background hover:opacity-100"
                aria-label={closeAriaLabel}
                disabled={isBlockDismissed}
                onClick={requestClose}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          <div className="flex w-full min-w-0 flex-col gap-4">{body}</div>
        </div>

        {footerNode != null ? (
          <AppModalFooter
            className={cn(
              'shrink-0 border-t border-border px-6 py-4',
              footerClassName,
            )}
          >
            {footerNode}
          </AppModalFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

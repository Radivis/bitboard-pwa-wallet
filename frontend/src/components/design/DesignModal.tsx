import * as React from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DesignCheckbox } from '@/components/design/DesignCheckbox'
import { DesignInfomodeToggle } from '@/components/design/DesignInfomodeToggle'
import { designFocusClassName } from '@/components/design/design-classes'
import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'

/** Tall modals must scroll inside the panel — Radix locks document scroll while open. */
const DESIGN_MODAL_MAX_HEIGHT_CLASS = 'max-h-[min(90dvh,calc(100vh-2rem))]'

const panelClassName =
  'design-ui flex w-[clamp(380px,50vw,760px)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] border-0 bg-[var(--design-elevation-4)] p-3 sm:max-w-[calc(100%-2rem)]'

export type DesignModalRequestClose = () => void

export interface DesignModalOptIn {
  id: string
  label: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  testId?: string
}

export interface DesignModalProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** Visible dialog title (not the HTML `title` attribute — avoids clashing with `DialogContent`). */
  title: React.ReactNode
  /** Invoked when the dialog closes via X, overlay, Escape, or explicit requestClose from footer/children. */
  onCancel: () => void
  children:
    | React.ReactNode
    | ((requestClose: DesignModalRequestClose) => React.ReactNode)
  footer?:
    | React.ReactNode
    | ((requestClose: DesignModalRequestClose) => React.ReactNode)
  optIn?: DesignModalOptIn
  isBlockDismissed?: boolean
  /** When true, the header close (X) control is not rendered (overlay/Escape still follow blockDismiss). */
  isCloseButtonHidden?: boolean
  closeAriaLabel?: string
  contentClassName?: string
  /** Passed to Radix Dialog root as argument "modal"(default true). */
  isModal?: boolean
  /** Merged into the action row around `footer`. */
  footerClassName?: string
}

/**
 * Design-system dialog: elevation-4 panel, Infomode toggle, optional acknowledgement, optional actions.
 * Close paths call onCancel once, then onOpenChange(false), except when blockDismiss is true.
 *
 * **Controlled usage:** Some parents pass `onOpenChange={() => {}}` and rely on `onCancel` to
 * update local `open` state (e.g. clear form + `setOpen(false)`). That matches this component’s
 * close order; if you only no-op `onCancel`, the dialog can stay open incorrectly.
 */
export function DesignModal({
  isOpen,
  onOpenChange,
  title,
  onCancel,
  children,
  footer,
  optIn,
  isBlockDismissed = false,
  isCloseButtonHidden = false,
  closeAriaLabel = 'Close',
  contentClassName,
  isModal = true,
  footerClassName,
  ...dialogContentProps
}: DesignModalProps &
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

  const requestClose: DesignModalRequestClose = () => {
    handleOpenChange(false)
  }

  const body = typeof children === 'function' ? children(requestClose) : children
  const footerNode = typeof footer === 'function' ? footer(requestClose) : footer

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange} modal={isModal}>
      <DialogContent
        showCloseButton={false}
        className={cn(panelClassName, DESIGN_MODAL_MAX_HEIGHT_CLASS, contentClassName)}
        onInteractOutside={(event) => {
          if (isBlockDismissed) event.preventDefault()
          onInteractOutsideFromProps?.(event)
        }}
        onEscapeKeyDown={(event) => {
          if (isBlockDismissed) event.preventDefault()
          onEscapeKeyDownFromProps?.(event)
        }}
        {...restDialogContentProps}
        data-slot="design-modal"
      >
        <div className="flex w-full min-w-0 shrink-0 items-center justify-between gap-2 px-3">
          <DialogTitle
            asChild
            className={cn(
              'min-w-0 text-left text-[var(--design-text-card-title)]',
              designTypeClassName.screenHeading,
            )}
          >
            <h2>{title}</h2>
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            <DesignInfomodeToggle />
            {!isCloseButtonHidden && (
              <button
                type="button"
                aria-label={closeAriaLabel}
                disabled={isBlockDismissed}
                onClick={requestClose}
                className={cn(
                  designFocusClassName,
                  'inline-flex size-8 shrink-0 items-center justify-center rounded-[16px] border border-[var(--design-nav-stroke)] bg-[var(--design-nav-background)] text-[var(--design-input-content)] disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <X className="size-6" aria-hidden />
              </button>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-3">
          {body}
          {optIn != null && (
            <div className="flex items-center gap-3">
              <DesignCheckbox
                id={optIn.id}
                checked={optIn.checked}
                disabled={optIn.disabled}
                data-testid={optIn.testId}
                onChange={(event) => optIn.onChange(event.target.checked)}
              />
              <label
                htmlFor={optIn.id}
                className={cn(
                  'cursor-pointer text-[var(--design-text-card-description)]',
                  designTypeClassName.regular,
                )}
              >
                {optIn.label}
              </label>
            </div>
          )}
        </div>

        {footerNode != null ? (
          <div className={cn('flex shrink-0 flex-wrap items-center gap-3 p-3', footerClassName)}>
            <div className="min-w-px flex-1" aria-hidden />
            {footerNode}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

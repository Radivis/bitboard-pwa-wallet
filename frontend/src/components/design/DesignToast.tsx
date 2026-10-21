import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@/lib/shared/utils'
import { DesignStatusIcon, type DesignStatus } from '@/components/design/design-status'

export function DesignToast({
  status,
  title,
  description,
  onClose,
  className,
  ...props
}: React.ComponentProps<'article'> & {
  status: DesignStatus
  title: React.ReactNode
  description?: React.ReactNode
  onClose?: () => void
}) {
  return (
    <article
      data-slot="design-toast"
      data-status={status}
      className={cn('design-ui flex items-center gap-2 rounded-[16px] border px-4 py-2', className)}
      {...props}
    >
      <DesignStatusIcon status={status} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-base font-semibold">{title}</p>
        {description != null ? (
          <p data-slot="design-status-description" className="text-base font-normal">
            {description}
          </p>
        ) : null}
      </div>
      {onClose != null ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex size-5 shrink-0 items-center justify-center"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </article>
  )
}

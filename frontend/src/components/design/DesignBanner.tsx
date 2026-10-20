import * as React from 'react'

import { cn } from '@/lib/shared/utils'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignStatusIcon, type DesignStatus } from '@/components/design/design-status'

export type DesignBannerAction = {
  label: string
  onClick: React.ComponentProps<'button'>['onClick']
  icon?: React.ReactNode
}

export function DesignBanner({
  status,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  children,
  ...props
}: React.ComponentProps<'section'> & {
  status: DesignStatus
  title: React.ReactNode
  description?: React.ReactNode
  primaryAction?: DesignBannerAction
  secondaryAction?: DesignBannerAction
}) {
  return (
    <section
      data-slot="design-banner"
      data-status={status}
      className={cn('design-ui flex items-start gap-3 rounded-[16px] border px-4 py-3', className)}
      {...props}
    >
      <DesignStatusIcon status={status} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">{title}</p>
          {description != null ? (
            <p data-slot="design-status-description" className="text-base font-normal">
              {description}
            </p>
          ) : null}
        </div>
        {children}
        {primaryAction != null || secondaryAction != null ? (
          <div className="flex flex-wrap items-center gap-4">
            {primaryAction != null ? (
              <DesignButton appearance="secondary" icon={primaryAction.icon} onClick={primaryAction.onClick}>
                {primaryAction.label}
              </DesignButton>
            ) : null}
            {secondaryAction != null ? (
              <DesignButton appearance="tertiary" icon={secondaryAction.icon} onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </DesignButton>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

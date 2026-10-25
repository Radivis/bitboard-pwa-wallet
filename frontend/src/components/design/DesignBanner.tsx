import * as React from 'react'
import { Link } from '@tanstack/react-router'

import { designTypeClassName } from '@/components/design/design-type'
import { cn } from '@/lib/shared/utils'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignStatusIcon, type DesignStatus } from '@/components/design/design-status'

export type DesignBannerAction = {
  label: string
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  /** Router path. Renders the action as a link instead of a button. */
  to?: string
  icon?: React.ReactNode
  disabled?: boolean
  testId?: string
}

export function DesignBanner({
  status,
  title,
  description,
  optionalContent,
  primaryAction,
  secondaryAction,
  className,
  ...props
}: Omit<React.ComponentProps<'section'>, 'title'> & {
  status: DesignStatus
  title: React.ReactNode
  description?: React.ReactNode
  optionalContent?: React.ReactNode
  primaryAction?: DesignBannerAction
  secondaryAction?: DesignBannerAction
}) {
  return (
    <section
      data-slot="design-banner"
      data-status={status}
      className={cn(
        'design-ui flex items-center gap-2 rounded-[16px] border px-4 py-2',
        className,
      )}
      {...props}
    >
      <DesignStatusIcon status={status} />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
        <p className={cn('w-full text-center', designTypeClassName.emphasis)}>{title}</p>
        {description != null ? (
          <p
            data-slot="design-status-description"
            className={cn('w-full text-center', designTypeClassName.regular)}
          >
            {description}
          </p>
        ) : null}
        {optionalContent != null ? (
          <div data-slot="design-banner-optional-content" className="w-full text-left text-base">
            {optionalContent}
          </div>
        ) : null}
        {primaryAction != null || secondaryAction != null ? (
          <div className="flex flex-wrap items-center justify-center gap-4 p-1">
            {primaryAction != null ? (
              <DesignBannerActionButton action={primaryAction} appearance="secondary" />
            ) : null}
            {secondaryAction != null ? (
              <DesignBannerActionButton action={secondaryAction} appearance="tertiary" />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function DesignBannerActionButton({
  action,
  appearance,
}: {
  action: DesignBannerAction
  appearance: 'secondary' | 'tertiary'
}) {
  if (action.to != null) {
    return (
      <DesignButton appearance={appearance} disabled={action.disabled} asChild>
        <Link to={action.to} onClick={action.onClick} data-testid={action.testId}>
          {action.icon}
          {action.label}
        </Link>
      </DesignButton>
    )
  }

  return (
    <DesignButton
      appearance={appearance}
      icon={action.icon}
      onClick={action.onClick}
      disabled={action.disabled}
      data-testid={action.testId}
    >
      {action.label}
    </DesignButton>
  )
}

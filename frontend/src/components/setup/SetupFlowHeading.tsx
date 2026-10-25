import type { ReactNode } from 'react'
import { SetupBackToWelcomeButton } from '@/components/SetupBackToWelcomeButton'

/** Back control and title shared by the create and import setup screens. */
export function SetupFlowHeading({
  title,
  trailing,
}: {
  title: string
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <SetupBackToWelcomeButton />
      <h2 className="design-type-screen-heading">{title}</h2>
      {trailing}
    </div>
  )
}

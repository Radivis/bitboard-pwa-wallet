import type { ReactNode } from 'react'

export const designDrawerPanelClassName =
  'design-ui fixed top-14 right-0 z-40 flex w-[248px] flex-col gap-3 overflow-hidden rounded-bl-[32px] bg-[var(--design-drawer-surface)] p-4 shadow-[0_12px_24px_-8px_rgb(0_0_0/0.4)] backdrop-blur-[5px] outline-none'

export const designDrawerBackdropClassName = 'fixed inset-x-0 top-14 bottom-0 z-30'

export function DrawerSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-base font-semibold tracking-[0.6px] text-[var(--design-drawer-label)] uppercase">
      {children}
    </p>
  )
}

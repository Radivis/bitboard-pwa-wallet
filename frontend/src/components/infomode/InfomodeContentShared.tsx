/* eslint-disable react-refresh/only-export-components -- shared infomode layout constant and presentational components */
import type { ReactNode } from 'react'

/** Display contents so the heading and body join the popup grid. */
export const INFOMODE_CONTENT_CLASS = 'contents'

export function InfomodeHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="design-type-emphasis text-[var(--design-text-regular)]">
      {children}
    </h2>
  )
}

export function InfomodeParagraph({ children }: { children: ReactNode }) {
  return <p className="design-type-regular text-[var(--design-text-subdued)]">{children}</p>
}

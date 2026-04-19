/**
 * English legal notice — shared by PWA settings card and marketing footer.
 */
import { LegalNoticeEntityBlock } from './LegalNoticeEntityBlock'

/** Kept for tests or future gating; imprint is always offered in the product when true. */
export const LEGAL_NOTICE_EN_HAS_CONTENT = true

export function LegalNoticeEn({
  surface = 'app',
}: {
  surface?: 'app' | 'landing'
}) {
  return (
    <LegalNoticeEntityBlock
      surface={surface}
      statutoryLine="Information pursuant to Section 5 of the German Digital Services Act (DDG)"
      contactHeading="Contact details:"
    />
  )
}

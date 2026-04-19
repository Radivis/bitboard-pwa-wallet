/**
 * English legal notice — shared by PWA settings card and marketing footer.
 */
import { LegalNoticeEntityBlock } from './LegalNoticeEntityBlock'

/** Must stay aligned with `legal-notice-availability`: both DE and EN flags must be true to show imprint. */
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

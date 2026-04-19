/**
 * German imprint (Impressum) — shared by PWA settings card and marketing footer.
 * Styling: use `surface="landing"` on the marketing site (dark footer).
 */
import { LegalNoticeEntityBlock } from './LegalNoticeEntityBlock'

/** Kept for tests or future gating; imprint is always offered in the product when true. */
export const LEGAL_NOTICE_DE_HAS_CONTENT = true

export function LegalNoticeDe({
  surface = 'app',
}: {
  surface?: 'app' | 'landing'
}) {
  return (
    <LegalNoticeEntityBlock
      surface={surface}
      statutoryLine="Inhalte gemäß §5 DDG"
      contactHeading="Kontaktdaten:"
    />
  )
}

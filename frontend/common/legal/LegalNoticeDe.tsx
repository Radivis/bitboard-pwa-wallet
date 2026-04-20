/**
 * German imprint (Impressum) — shared by PWA settings card and marketing footer.
 * Styling: use `surface="landing"` on the marketing site (dark footer).
 */
import { LegalNoticeEntityBlock } from './LegalNoticeEntityBlock'

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

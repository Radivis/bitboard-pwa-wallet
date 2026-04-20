/**
 * English legal notice — shared by PWA settings card and marketing footer.
 */
import { LegalNoticeEntityBlock } from './LegalNoticeEntityBlock'

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

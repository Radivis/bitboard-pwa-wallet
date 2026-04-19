/**
 * English legal notice — shared by PWA settings card and marketing footer.
 */
import { LegalEntityFields } from '@legal-entity-fields'
import { legalEntity } from '@legal-entity'

/** Must stay aligned with `legal-notice-availability`: both DE and EN flags must be true to show imprint. */
export const LEGAL_NOTICE_EN_HAS_CONTENT = true

export function LegalNoticeEn({
  surface = 'app',
}: {
  surface?: 'app' | 'landing'
}) {
  const isLanding = surface === 'landing'
  const bodyClass = isLanding
    ? 'text-gray-500 text-sm space-y-2'
    : 'text-sm text-muted-foreground space-y-2'

  return (
    <div className="space-y-3">
      <LegalEntityFields
        entity={legalEntity}
        className="space-y-1"
        lineClassName={
          isLanding
            ? 'whitespace-pre-wrap text-sm text-gray-500'
            : undefined
        }
        emailLinkClassName={
          isLanding
            ? 'text-gray-500 underline underline-offset-2 hover:text-gray-200'
            : undefined
        }
      />
      <div className={bodyClass}>
        <p>
          Legal notice (example — replace copy in <code>LegalNoticeEn.tsx</code>)
        </p>
        <p>Provider: …</p>
        <p>Address: …</p>
        <p>Contact: …</p>
      </div>
    </div>
  )
}

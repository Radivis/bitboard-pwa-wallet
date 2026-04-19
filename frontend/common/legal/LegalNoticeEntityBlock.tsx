import { legalEntity } from '@legal-entity'

type LegalNoticeEntityBlockProps = {
  surface: 'app' | 'landing'
  /** Line directly under the imprint title (statutory basis). */
  statutoryLine: string
  /** Subheading before email (e.g. Kontaktdaten / Contact details). */
  contactHeading: string
}

/**
 * Operator name, address, and contact — shared layout for DE/EN imprint bodies.
 */
export function LegalNoticeEntityBlock({
  surface,
  statutoryLine,
  contactHeading,
}: LegalNoticeEntityBlockProps) {
  const isLanding = surface === 'landing'
  const line = isLanding
    ? 'whitespace-pre-wrap text-sm text-gray-500'
    : 'whitespace-pre-wrap text-sm text-muted-foreground'
  const subheading = isLanding ? 'text-gray-300' : 'text-foreground/80'
  const link = isLanding
    ? 'text-gray-500 underline underline-offset-2 hover:text-gray-200'
    : 'text-muted-foreground underline underline-offset-2 hover:text-foreground'

  const name = legalEntity.name.trim()
  const address = legalEntity.address.trim()
  const email = legalEntity.email.trim()

  return (
    <div className="space-y-3">
      <p className={line}>{statutoryLine}</p>

      {(name || address || email) && (
        <div>
          {name ? <p className={line}>{name}</p> : null}
          {address ? (
            <p className={name ? `${line} mt-6` : line}>{address}</p>
          ) : null}
          {email ? (
            <>
              <h3
                className={`mt-4 text-sm font-semibold tracking-tight ${subheading}`}
              >
                {contactHeading}
              </h3>
              <p className="pt-1 text-sm">
                <a href={`mailto:${email}`} className={link}>
                  {email}
                </a>
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

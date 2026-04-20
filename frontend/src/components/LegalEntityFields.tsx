import type { LegalEntity } from '../legal-entity/legal-entity'
import {
  hasLegalEntityData,
  legalEntityAddressLines,
} from '../legal-entity/legal-entity'

type LegalEntityFieldsProps = {
  entity: LegalEntity
  className?: string
  /** Classes for name and address lines. */
  lineClassName?: string
  /** Applied to the mailto link. */
  emailLinkClassName?: string
}

const defaultLine = 'whitespace-pre-wrap text-sm text-muted-foreground'
const defaultEmailLink =
  'text-muted-foreground underline underline-offset-2 hover:text-foreground'

export function LegalEntityFields({
  entity,
  className,
  lineClassName = defaultLine,
  emailLinkClassName = defaultEmailLink,
}: LegalEntityFieldsProps) {
  if (!hasLegalEntityData(entity)) return null

  const name = entity.name.trim()
  const addressLines = legalEntityAddressLines(entity.address)
  const addressText = addressLines.join('\n')
  const email = entity.email.trim()

  return (
    <div className={className}>
      {name ? <p className={lineClassName}>{name}</p> : null}
      {addressText ? <p className={lineClassName}>{addressText}</p> : null}
      {email ? (
        <p className="text-sm">
          <a href={`mailto:${email}`} className={emailLinkClassName}>
            {email}
          </a>
        </p>
      ) : null}
    </div>
  )
}

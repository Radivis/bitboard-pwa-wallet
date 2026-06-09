import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeExitInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Exit to on-chain</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        Exiting moves Arkade funds back to a normal Bitcoin bc1 address.{' '}
        <strong className="font-medium text-popover-foreground">Collaborative exit</strong> uses the
        Arkade operator—faster and usually cheaper.{' '}
        <strong className="font-medium text-popover-foreground">Unilateral exit</strong> works
        without the operator but needs on-chain fee transactions and a wait for timelocks.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Read{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
        {' '}and{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxoExpiry}>VTXO expiry and renewal</ArticleLink>.
      </ArkadeInfomodeParagraph>
    </div>
  )
}

import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeUnilateralExitInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Unilateral exit</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        Reclaim one virtual balance unit (VTXO) without the operator by publishing an on-chain
        unroll chain, then completing after the timelock. Use this when the operator is down or you
        need to recover a specific VTXO.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        You pay miner fees from the bumper wallet below. Pick a VTXO, unroll, then complete to
        your bc1 destination.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </ArkadeInfomodeParagraph>
    </div>
  )
}

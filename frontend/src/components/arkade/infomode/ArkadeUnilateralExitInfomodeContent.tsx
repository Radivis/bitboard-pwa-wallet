import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeUnilateralExitInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Unilateral exit</InfomodeHeading>
      <InfomodeParagraph>
        Reclaim one virtual balance unit (VTXO) without the operator by publishing an on-chain
        unroll chain, then completing after the timelock. Use this when the operator is down or you
        need to recover a specific VTXO.
      </InfomodeParagraph>
      <InfomodeParagraph>
        You pay miner fees from the bumper wallet below. Pick a VTXO, unroll, then complete to
        your bc1 destination. When the operator is unreachable, enable autonomous mode in
        Management to run unilateral exit from cached exit materials.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

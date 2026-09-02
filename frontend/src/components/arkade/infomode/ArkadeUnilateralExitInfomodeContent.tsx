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
        your bc1 destination. If you will not talk to this operator—because it is down or you do not
        trust it—enable autonomous mode in Management so unilateral exit uses cached exit materials.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
        {' · '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.unilateralExitRisks}>
          Risks of unilateral exit
        </ArticleLink>
        {' · '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.sharedLeafUnilateralExit}>
          Shared leaf VTXOs
        </ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeSharedLeafUnilateralExitInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Shared leaf VTXOs</InfomodeHeading>
      <InfomodeParagraph>
        One leaf virtual transaction can carry several VTXO outpoints (for example payment plus
        change). Unroll publishes the whole leaf on chain, so Bitboard selects all sibling outpoints
        together.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.sharedLeafUnilateralExit}>
          Shared leaf VTXOs in unilateral exit
        </ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeCollaborativeExitInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Collaborative exit</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        The Arkade operator batches your virtual balance units (VTXOs) into an on-chain withdrawal
        to your bc1 destination. You need operator connectivity; this is usually the fastest way
        to leave Arkade.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Leave the amount empty to exit your full spendable balance, or enter a partial amount in
        sats.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </ArkadeInfomodeParagraph>
    </div>
  )
}

import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeCollaborativeExitInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Collaborative exit</InfomodeHeading>
      <InfomodeParagraph>
        The Arkade operator batches your virtual balance units (VTXOs) into an on-chain withdrawal
        to your bc1 destination. You need operator connectivity; this is usually the fastest way
        to leave Arkade.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Leave the amount empty to exit your full spendable balance, or enter a partial amount in
        sats.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

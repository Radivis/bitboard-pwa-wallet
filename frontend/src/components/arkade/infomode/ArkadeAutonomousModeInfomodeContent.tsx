import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeAutonomousModeInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Autonomous mode</InfomodeHeading>
      <InfomodeParagraph>
        Enable this when you do not trust this Arkade operator (ASP)—or when it is down. The wallet
        stops contacting the operator, including after unlock or reload, and uses cached operator
        parameters plus prefetched exit materials from your last successful sync.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Cooperative exit, sends, renewals, recoverable settlement, signer migration, and operator
        sync are blocked while autonomous mode is active. Esplora is still required for broadcast
        and timelock checks. Turn autonomous mode off only when you are ready to trust and sync with
        this operator again.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

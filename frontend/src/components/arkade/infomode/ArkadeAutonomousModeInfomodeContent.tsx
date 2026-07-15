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
        When the Arkade operator (ASP) is unreachable, turn this on to run unilateral exit using
        data saved during your last successful operator sync: cached operator parameters and
        per-VTXO exit materials (virtual PSBT chains).
      </InfomodeParagraph>
      <InfomodeParagraph>
        Cooperative exit, sends, renewals, recoverable settlement, signer migration, and manual
        operator sync are blocked while autonomous mode is active. Esplora is still required for
        fee rates, broadcast, and timelock checks.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.exits}>Exiting Arkade to on-chain</ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

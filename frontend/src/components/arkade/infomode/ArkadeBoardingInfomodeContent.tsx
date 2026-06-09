import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeBoardingInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Boarding into Arkade</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        Boarding moves Bitcoin from the blockchain into Arkade in three steps: copy the boarding
        address, send from your on-chain wallet, wait for confirmation, then settle into virtual
        balance units (VTXOs).
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Use the boarding address below—not your regular bc1 receive address and not your ark1/tark1
        Arkade receive address.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Step-by-step guide:{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.boarding}>Boarding Bitcoin into Arkade</ArticleLink>.
      </ArkadeInfomodeParagraph>
    </div>
  )
}

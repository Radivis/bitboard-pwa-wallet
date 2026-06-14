import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeBoardingInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Boarding into Arkade</InfomodeHeading>
      <InfomodeParagraph>
        Boarding moves Bitcoin from the blockchain into Arkade in three steps: copy the boarding
        address, send from your on-chain wallet, wait for confirmation, then settle into virtual
        balance units (VTXOs).
      </InfomodeParagraph>
      <InfomodeParagraph>
        Use the boarding address below—not your regular bc1 receive address and not your ark1/tark1
        Arkade receive address.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Step-by-step guide:{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.boarding}>Boarding Bitcoin into Arkade</ArticleLink>.
      </InfomodeParagraph>
    </div>
  )
}

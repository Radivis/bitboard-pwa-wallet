import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeReceivePaymentCountInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Payments to this address</InfomodeHeading>
      <InfomodeParagraph>
        This count is the number of payments on this Arkade script. A count of 0 means the script
        is still fresh.
      </InfomodeParagraph>
      <InfomodeParagraph>
        The operator can already connect your VTXO movements. The count is for the chain. A
        collaborative exit pays an on-chain address and leaves this script unpublished. A
        unilateral exit publishes it, and reuse lets observers tie those exits together. That
        record is still smaller than receiving every payment on-chain.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Learn more: <ArticleLink slug={ARKADE_LIBRARY_SLUGS.privacyInArk}>Privacy in Ark</ArticleLink>
        .
      </InfomodeParagraph>
    </div>
  )
}

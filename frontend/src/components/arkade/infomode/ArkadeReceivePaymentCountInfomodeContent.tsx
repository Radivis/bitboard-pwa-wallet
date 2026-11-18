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
        This count is the number of incoming payments on this Arkade script. A payment still
        counts after it is spent. Change from your own send, and a renewal of a coin already
        counted, are not extra payments. A count of 0 means nobody has paid this script.
      </InfomodeParagraph>
      <InfomodeParagraph>
        An unspent boarding deposit uses this key without paying the Arkade script, so Generate
        can skip the unused-address question while the count stays 0. Settling that boarding
        output onto this script counts once.
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

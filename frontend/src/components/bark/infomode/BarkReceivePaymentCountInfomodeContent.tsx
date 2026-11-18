import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export const BARK_RECEIVE_PAYMENT_COUNT_INFO_ID = 'bark-receive-payment-count'

export function BarkReceivePaymentCountInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Payments to this address</InfomodeHeading>
      <InfomodeParagraph>
        This count is the number of times this Bark address received a coin. A payment still
        counts after it is spent. Change from your own send counts too, because that reuse is
        what a unilateral exit would publish. A renewal of a coin already counted is not an extra
        receive. A count of 0 means this address has not received a coin.
      </InfomodeParagraph>
      <InfomodeParagraph>
        An unfinished board does not count. The VTXO a finished board settles into counts once.
      </InfomodeParagraph>
      <InfomodeParagraph>
        The server can already connect your VTXO movements. The count is for the chain. Leaving
        with the server pays an on-chain address and leaves this address unpublished. A unilateral
        exit publishes that coin&apos;s line, and reuse lets observers tie those exits together.
        That record is still smaller than receiving every payment on-chain.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Learn more:{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.privacyInArk}>Privacy in Ark</ArticleLink>.
      </InfomodeParagraph>
    </div>
  )
}

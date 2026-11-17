import { ArticleLink } from '@/lib/library/article-shared'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ReceivePaymentCountInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Payments to this address</InfomodeHeading>
      <InfomodeParagraph>
        This count matters for privacy. Each extra payment to the same address is address reuse:
        observers can link those payments to one recipient, which is a common way to deanonymize a
        wallet. A count of 0 means this address is still fresh.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Learn more:{' '}
        <ArticleLink slug="address-reuse-and-deanonymization">
          Address reuse and deanonymization
        </ArticleLink>
        .
      </InfomodeParagraph>
    </div>
  )
}

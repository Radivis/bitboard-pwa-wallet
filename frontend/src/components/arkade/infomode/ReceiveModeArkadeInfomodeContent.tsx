import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ReceiveModeArkadeInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Bitcoin, Lightning, and Arkade</InfomodeHeading>
      <InfomodeParagraph>
        <strong className="font-medium text-popover-foreground">Bitcoin (on-chain)</strong> uses your
        bc1 address on the blockchain.{' '}
        <strong className="font-medium text-popover-foreground">Lightning</strong> uses invoices or
        lightning addresses for fast off-chain payments.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <strong className="font-medium text-popover-foreground">Arkade</strong> uses ark1 or tark1
        addresses for virtual balance units (VTXOs)—a separate offchain layer from both. Choose the
        mode your sender will use.
      </InfomodeParagraph>
      <InfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
      </InfomodeParagraph>
    </div>
  )
}

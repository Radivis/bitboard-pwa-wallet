import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ReceiveModeArkadeInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Bitcoin, Lightning, and Arkade</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        <strong className="font-medium text-popover-foreground">Bitcoin (on-chain)</strong> uses your
        bc1 address on the blockchain.{' '}
        <strong className="font-medium text-popover-foreground">Lightning</strong> uses invoices or
        lightning addresses for fast off-chain payments.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <strong className="font-medium text-popover-foreground">Arkade</strong> uses ark1 or tark1
        addresses for virtual balance units (VTXOs)—a separate offchain layer from both. Choose the
        mode your sender will use.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
      </ArkadeInfomodeParagraph>
    </div>
  )
}

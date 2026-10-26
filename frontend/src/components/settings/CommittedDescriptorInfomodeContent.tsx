import { INFOMODE_CONTENT_CLASS } from '@/components/infomode/InfomodeContentShared'
import { ArticleLink } from '@/lib/library/article-shared'

const DESCRIPTORS_ARTICLE_SLUG = 'what-are-descriptors-and-descriptor-wallets' as const

/**
 * Rich Infomode body for the receiving descriptor on Settings → Network.
 * Must be a no-props component for InfomodeWrapper.
 */
export function CommittedDescriptorInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <h2 className="design-type-emphasis text-popover-foreground">
        Output descriptors
      </h2>
      <p className="design-type-regular text-muted-foreground">
        An <strong className="design-type-emphasis text-popover-foreground">output descriptor</strong> is a
        compact text recipe that tells wallet software how to derive addresses and sign spends—paths,
        script types, and extended public keys—without storing the seed phrase in that form.
      </p>
      <p className="design-type-regular text-muted-foreground">
        Bitboard keeps a <strong className="design-type-emphasis text-popover-foreground">descriptor wallet</strong>{' '}
        per Bitcoin network, address type, and account: one external (receiving) descriptor and one
        internal (change) descriptor. The line below is your{' '}
        <strong className="design-type-emphasis text-popover-foreground">external / receiving</strong>{' '}
        descriptor; change outputs use the internal descriptor, which is not shown here.
      </p>
      <p className="design-type-regular text-muted-foreground">
        You may notice the <strong className="design-type-emphasis text-popover-foreground">same</strong> text when
        switching between some networks (for example Testnet, Signet, and Lab): the string mostly
        describes your keys and paths, not which chain you are connected to. Bitboard still{' '}
        <strong className="design-type-emphasis text-popover-foreground">stores each network’s wallet
        separately</strong>, because Testnet, Signet, Lab, and the others are different networks with
        different coins and history—your balances and activity must not get mixed together.
      </p>
      <p className="design-type-regular text-muted-foreground">
        Treat this string as sensitive metadata: it can reveal xpub fingerprints and derivation
        structure. For a friendly introduction with links to related topics, read{' '}
        <ArticleLink slug={DESCRIPTORS_ARTICLE_SLUG}>Descriptors and descriptor wallets</ArticleLink>
        {' '}
        in the Library.
      </p>
    </div>
  )
}

import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'are-bitcoin-and-lightning-different-cryptocurrencies',
  title: 'Are Bitcoin and Lightning different cryptocurrencies?',
  tagIds: ['lightning', 'l2', 'bitcoin', 'cryptocurrencies'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          <strong>No.</strong> Lightning is not a separate cryptocurrency—it is a payment layer that
          runs on top of Bitcoin. Think of it like a tab at a bar: you settle up in real dollars at
          the end, but individual drinks are tracked off the main register. Lightning tracks payments
          off-chain, but the underlying asset is still bitcoin (BTC).
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Lightning is a protocol and network where balances in payment channels are backed by
          ordinary Bitcoin <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink> locked in on-chain
          transactions. You are still moving the same asset subject to Bitcoin&apos;s rules at
          settlement.
        </p>
        <p>
          What differs is <em>where</em> activity is recorded. On-chain Bitcoin transactions are
          written to the global blockchain; Lightning updates channel balances with off-chain
          messages between peers, and only occasionally anchors or closes channels on chain. See{' '}
          <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink> and{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          A Lightning channel is opened by broadcasting an on-chain funding transaction that locks
          bitcoin into a 2-of-2 multisig output. Both parties hold pre-signed commitment transactions
          that can close the channel unilaterally if needed. Payments update these commitment states
          using hash time-locked contracts (HTLCs), allowing trustless routing across multiple hops.
          Only when channels are opened or closed (or disputes arise) does activity touch the base
          layer.
        </p>
        <p>
          Other projects may issue their own tokens on separate networks; that is a different story.
          Here, Lightning is best understood as a <strong>scaling and payment-routing layer</strong>{' '}
          for Bitcoin, not a rival coin. For the base layer, read{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

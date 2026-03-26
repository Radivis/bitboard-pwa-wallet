import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'are-bitcoin-and-lightning-different-cryptocurrencies',
  title: 'Are Bitcoin and Lightning different cryptocurrencies?',
  tagIds: ['lightning', 'l2', 'bitcoin', 'cryptocurrencies'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>No</strong>—in the usual sense, Lightning is not a separate cryptocurrency with its
        own independent monetary policy. <strong>Lightning</strong> is a protocol and network that runs
        <em>on top of</em> Bitcoin: balances in payment channels are backed by ordinary Bitcoin{' '}
        <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink> locked in on-chain transactions. You are
        still moving the same asset (bitcoin, BTC) subject to Bitcoin&apos;s rules at settlement.
      </p>
      <p>
        What differs is <em>where</em> activity is recorded. On-chain Bitcoin transactions are written
        to the global blockchain; Lightning updates channel balances with off-chain messages between
        peers, and only occasionally anchors or closes channels on chain. See{' '}
        <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink> and{' '}
        <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
      </p>
      <p>
        Other projects may issue their own tokens on separate networks; that is a different story.
        Here, Lightning is best understood as a <strong>scaling and payment-routing layer</strong> for
        Bitcoin, not a rival coin. For the base layer, read{' '}
        <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}

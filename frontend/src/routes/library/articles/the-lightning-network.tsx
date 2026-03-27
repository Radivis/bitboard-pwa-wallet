import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'the-lightning-network',
  title: 'The Lightning network',
  tagIds: ['lightning', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Lightning is a peer-to-peer network of <strong>payment channels</strong> on top of Bitcoin.
        Two parties open a channel with an on-chain transaction that locks funds under rules they both
        agree to; they then exchange <strong>off-chain</strong> updates (signed messages) that move
        the balance between them without publishing every move to the blockchain.
      </p>
      <p>
        <strong>Routing</strong> lets payments hop across multiple channels: intermediate nodes
        forward liquidity for a small fee, similar to how internet packets hop between routers. The
        protocol family is specified in BOLTs (Basis of Lightning Technology); see{' '}
        <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink>.
      </p>
      <p>
        For how L2 fits next to the base chain, see{' '}
        <ArticleLink slug="layer-2-networks">Layer 2 networks</ArticleLink>. For whether Lightning is a
        separate coin, see{' '}
        <ArticleLink slug="are-bitcoin-and-lightning-different-cryptocurrencies">
          Are Bitcoin and Lightning different cryptocurrencies?
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

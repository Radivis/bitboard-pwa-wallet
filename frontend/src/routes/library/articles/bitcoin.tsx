import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin',
  title: 'Bitcoin',
  tagIds: ['bitcoin', 'cryptocurrencies'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Bitcoin is a decentralized digital currency: participants agree on who owns which coins
        without relying on a central bank. Consensus is reached on a shared public ledger (the
        blockchain) through proof-of-work mining and full nodes that validate the rules.
      </p>
      <p>
        A bitcoin wallet does not store coins; it holds keys that let you spend coins recorded on
        the network. See <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> for how
        that works in practice.
      </p>
      <p>
        Segregated Witness (SegWit), activated in 2017, changed how transaction data is structured and
        helped scale on-chain capacity; read <ArticleLink slug="segwit">SegWit</ArticleLink> for a
        short overview and why it matters for fees and security.
      </p>
    </div>
  ),
}

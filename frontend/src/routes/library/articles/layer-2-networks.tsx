import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'layer-2-networks',
  title: 'Layer 2 networks',
  tagIds: ['l2', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Layer 2 (L2)</strong> systems build on top of a base blockchain (<strong>layer 1</strong>
        ) to offer faster or cheaper transfers. Instead of recording every small payment on the main
        chain, participants move activity <strong>off-chain</strong>—still anchored by rules that let
        them fall back to on-chain settlement if something goes wrong.
      </p>
      <p>
        The Lightning Network is a prominent L2 for Bitcoin: <strong>payment channels</strong> lock
        funds on chain with a shared balance; participants then exchange signed updates that reallocate
        the balance instantly and cheaply. A network of <strong>routing</strong> nodes can forward
        payments across channels so payer and payee do not need a direct channel. Lightning uses the
        same asset as on-chain Bitcoin—see{' '}
        <ArticleLink slug="are-bitcoin-and-lightning-different-cryptocurrencies">
          Are Bitcoin and Lightning different cryptocurrencies?
        </ArticleLink>
        .
      </p>
      <p>
        Read <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink> for an
        overview, and <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for the base layer&apos;s
        role.
      </p>
    </div>
  ),
}

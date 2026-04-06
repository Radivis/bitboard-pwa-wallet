import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-primal-wallet',
  title: 'Primal wallet and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Primal</strong> is a Nostr-focused client with wallet features. If you already use
        Nostr for social posts and zaps, Primal can be a natural place to manage Lightning and
        export an <strong>NWC</strong> connection for apps like Bitboard.
      </p>
      <p>
        You still paste the same <code className="text-sm">nostr+walletconnect://</code> connection
        string into Bitboard; the wallet behind NWC handles balances and payments. For Lightning
        basics, see <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://primal.net/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          primal.net
        </a>
        .
      </p>
    </div>
  ),
}

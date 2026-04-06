import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-lnbits',
  title: 'LNbits and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>LNbits</strong> is a free, open-source wallet and accounts layer you run on your own
        server. You install it alongside a Lightning node, create wallets or extensions as needed, and
        can enable <strong>NWC</strong> so Bitboard and other apps use NIP-47 to talk to those
        wallets.
      </p>
      <p>
        This is an <strong>advanced</strong> option: you maintain the server, backups, and security
        boundary. It is attractive for hackers, merchants, and homelab setups that already run
        Bitcoin infrastructure. For Lightning concepts, see{' '}
        <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://lnbits.com/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          lnbits.com
        </a>
        .
      </p>
    </div>
  ),
}

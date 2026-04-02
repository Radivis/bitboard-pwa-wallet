import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-electrum',
  title: 'Electrum and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Electrum</strong> is a long-standing Bitcoin wallet for desktop (and more). Where
        Lightning and plugin support include <strong>Nostr Wallet Connect</strong>, you can route NWC
        from Electrum-backed Lightning into Bitboard by pasting the exported connection string.
      </p>
      <p>
        Capabilities change with Electrum version and platform; check Electrum&apos;s own
        documentation for current Lightning and NWC support. For self-custody basics, see{' '}
        <ArticleLink slug="not-your-keys-not-your-coins-explained">
          Not your keys, not your coins explained
        </ArticleLink>{' '}
        and <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://electrum.org/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          electrum.org
        </a>
        .
      </p>
    </div>
  ),
}

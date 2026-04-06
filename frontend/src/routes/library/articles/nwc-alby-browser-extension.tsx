import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-alby-browser-extension',
  title: 'Alby browser extension and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        The <strong>Alby browser extension</strong> adds Lightning and NWC to Chromium-based and
        Firefox browsers. If you use Bitboard in the same browser, you can keep your NWC connection
        handy: open the extension, create or select a wallet connection, then copy the NWC URI into
        Bitboard&apos;s Lightning settings.
      </p>
      <p>
        This path suits people who work at a desktop and want fewer context switches than switching
        to a separate mobile app. The protocol is the same as other NWC wallets—see{' '}
        <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink> for background.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://getalby.com/products/browser-extension"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          getalby.com — Browser extension
        </a>
        .
      </p>
    </div>
  ),
}

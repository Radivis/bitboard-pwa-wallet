import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-self-hosted-alby-hub',
  title: 'Self-hosted Alby Hub and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Alby Hub</strong> can run on <em>your</em> hardware or VPS instead of Alby&apos;s
        cloud. You operate the Hub process, updates, and backups; you get more control and avoid a
        hosted subscription to Alby for the server piece. You still use the same{' '}
        <strong>NWC</strong> flow: create a connection in Hub or a linked app, then paste the URI
        into Bitboard.
      </p>
      <p>
        Compare with <ArticleLink slug="nwc-alby-hub-cloud">Alby Hub (cloud)</ArticleLink>, where the
        operator runs the server for you. Neither option removes the need to understand Lightning
        basics—see <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://albyhub.com/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          albyhub.com
        </a>
        .
      </p>
    </div>
  ),
}

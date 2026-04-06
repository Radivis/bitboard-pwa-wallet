import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-alby-hub-cloud',
  title: 'Alby Hub (cloud) and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Alby Hub</strong> can run as managed infrastructure in the cloud. You pay for
        convenience: the Hub process and related services are operated for you, while you still use
        standard Lightning and NWC tooling from Alby&apos;s apps. You create an NWC connection from
        the Hub or linked wallet and paste the URI into Bitboard.
      </p>
      <p>
        This differs from <strong>self-hosting</strong> Hub on your own server (more control, more
        operations work)—see{' '}
        <ArticleLink slug="nwc-self-hosted-alby-hub">Self-hosted Alby Hub</ArticleLink>. For what
        Lightning is, see <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>.
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

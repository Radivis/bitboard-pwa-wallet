import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'nwc-zeus',
  title: 'Zeus and NWC',
  tagIds: ['lightning', 'wallets'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Zeus</strong> is a mobile (and embedded) Lightning node front-end. Advanced users
        connect it to their own <strong>LND</strong>, <strong>Core Lightning</strong>, or similar
        node, then enable <strong>Nostr Wallet Connect</strong> so external apps can request
        payments with your approval.
      </p>
      <p>
        This path prioritizes <strong>self-custody</strong> of Lightning keys on infrastructure you
        control. Expect more setup than a hosted wallet: channels, backups, and updates are your
        responsibility. See <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>{' '}
        and <ArticleLink slug="what-is-a-wallet">What is a wallet?</ArticleLink> for context.
      </p>
      <p>
        Official site:{' '}
        <a
          href="https://zeusln.com/"
          className="text-primary underline-offset-4 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          zeusln.com
        </a>
        .
      </p>
    </div>
  ),
}

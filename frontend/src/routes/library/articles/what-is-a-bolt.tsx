import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-bolt',
  title: 'What is a BOLT?',
  tagIds: ['standards', 'lightning', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        BOLT stands for Basis of Lightning Technology. BOLTs are written specifications—similar in
        spirit to an RFC in networking—describing how Lightning nodes interoperate: channel
        establishment, gossip, routing, failures, and security considerations.
      </p>
      <p>
        They are separate from BIPs but serve a similar coordination role for the Lightning layer.
        Implementers follow BOLTs to build compatible Lightning software on top of Bitcoin.
      </p>
      <p>
        For the user-facing network, see{' '}
        <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>. For
        Bitcoin-layer standards, see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
      </p>
    </div>
  ),
}

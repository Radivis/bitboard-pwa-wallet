import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-bolt',
  title: 'What is a BOLT?',
  tagIds: ['standards', 'lightning', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          BOLT stands for Basis of Lightning Technology. BOLTs are the rulebooks that ensure
          different Lightning implementations can talk to each other—like how USB standards let
          different devices plug into the same port.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          BOLTs are written specifications—similar in spirit to an RFC in networking—describing how
          Lightning nodes interoperate: channel establishment, gossip, routing, failures, and
          security considerations.
        </p>
        <p>
          They are separate from BIPs but serve a similar coordination role for the Lightning layer.
          Implementers follow BOLTs to build compatible Lightning software on top of Bitcoin.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          There are multiple BOLTs covering different aspects: BOLT 1 (base protocol), BOLT 2
          (channels), BOLT 4 (onion routing), BOLT 11 (invoice format), and more. Updates go through
          community review and multiple implementations must agree before changes are finalized.
        </p>
        <p>
          For the user-facing network, see{' '}
          <ArticleLink slug="the-lightning-network">The Lightning network</ArticleLink>. For
          Bitcoin-layer standards, see <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

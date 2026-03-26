import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-peer-to-peer-network',
  title: 'What is a peer to peer network?',
  tagIds: ['decentralized-networks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In a peer-to-peer (P2P) network, nodes connect as equals: they relay data (such as
        transactions and blocks) without requiring a central hub that must stay online for the system
        to work.
      </p>
      <p>
        Resilience comes from redundancy: many independent participants validate and propagate
        information according to shared rules.
      </p>
      <p>
        Bitcoin&apos;s node layer is P2P; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for how
        that supports a decentralized currency.
      </p>
    </div>
  ),
}

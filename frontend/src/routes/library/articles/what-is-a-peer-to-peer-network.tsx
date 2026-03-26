import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-peer-to-peer-network',
  title: 'What is a peer to peer network?',
  tagIds: ['decentralized-networks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In a <strong>peer-to-peer (P2P)</strong> network, computers (called <strong>nodes</strong> or{' '}
        <strong>peers</strong>) connect as equals: they relay data—such as transactions and blocks—to
        neighbors without requiring one central server that must stay online for the whole system to
        function.
      </p>
      <p>
        Resilience comes from redundancy: many independent participants validate and propagate
        information according to shared rules. That design fits open networks where anyone can join
        and leave.
      </p>
      <p>
        Bitcoin&apos;s node layer is P2P; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for how
        that supports a decentralized currency.
      </p>
    </div>
  ),
}

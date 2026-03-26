import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'blockdag',
  title: 'BlockDAG',
  tagIds: ['blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>BlockDAG</strong> refers to protocols where blocks form a <strong>directed acyclic graph</strong>
        : new blocks can confirm multiple predecessors instead of extending a single chain tip only.
        Researchers and some networks explore DAG structures to improve throughput or latency compared
        with classic longest-chain <ArticleLink slug="proof-of-work-and-mining-basics">Nakamoto-style proof-of-work</ArticleLink>{' '}
        consensus on a single parent chain.
      </p>
      <p>
        These designs differ from Bitcoin&apos;s primary chain model and usually come with different
        ordering, finality, and attacker models. They illustrate the broader family of
        &quot;block-based&quot; distributed ledgers beyond a simple linked list of blocks.
      </p>
      <p>
        For the classic linear structure used by Bitcoin, see{' '}
        <ArticleLink slug="block-network-vs-blockchain">
          The difference between a block network and a blockchain
        </ArticleLink>{' '}
        and <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}

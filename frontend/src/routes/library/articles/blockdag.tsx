import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'blockdag',
  title: 'BlockDAG',
  tagIds: ['blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A BlockDAG is a twist on the blockchain idea: instead of each block having exactly one
          parent, blocks can reference multiple predecessors. Think of it like a family tree where
          children can have two parents—it is still acyclic (no loops), but the structure is richer
          than a single line.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>BlockDAG</strong> refers to protocols where blocks form a{' '}
          <strong>directed acyclic graph</strong>: new blocks can confirm multiple predecessors
          instead of extending a single chain tip only. Researchers and some networks explore DAG
          structures to improve throughput or latency compared with classic{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">Nakamoto-style proof-of-work</ArticleLink>{' '}
          consensus.
        </p>
        <p>
          These designs differ from Bitcoin&apos;s primary chain model and usually come with
          different ordering, finality, and attacker models. They illustrate the broader family of
          block-based distributed ledgers beyond a simple linked list of blocks.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          In a DAG protocol, when two miners find blocks simultaneously, both can be included rather
          than one becoming orphaned. Ordering transactions across a DAG requires additional rules
          (topological sorting, GHOSTDAG weighting, etc.) that vary by protocol. Security proofs and
          finality guarantees differ substantially from Bitcoin&apos;s longest-chain rule.
        </p>
        <p>
          Bitcoin uses <strong>single-parent</strong> blocks, where the interesting distinction is
          between <em>all</em> mined blocks and the one canonical chain—see{' '}
          <ArticleLink slug="block-network-vs-blockchain">
            The difference between a block network and a blockchain
          </ArticleLink>{' '}
          and <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

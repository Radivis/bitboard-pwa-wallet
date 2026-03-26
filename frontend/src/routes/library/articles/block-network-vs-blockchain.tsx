import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'block-network-vs-blockchain',
  title: 'The difference between a block network and a blockchain',
  tagIds: ['blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <em>blockchain</em> is a data structure: an ordered chain of blocks, each linking to the
        previous via{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">cryptographic hashes</ArticleLink>,
        typically carrying an append-only transaction history. Each block usually points to exactly
        one parent block, forming a single line back to the first block.
      </p>
      <p>
        A <em>block network</em> (or block DAG) generalizes the idea: blocks may reference multiple
        prior blocks, forming a <strong>directed acyclic graph (DAG)</strong>—a graph of blocks with
        no loops—rather than a single parent chain. Different projects use DAG-based designs to
        increase throughput or parallelize confirmation, with different tradeoffs in security
        assumptions and implementation complexity.
      </p>
      <p>
        Bitcoin uses a linear blockchain at its core. For a related DAG-oriented topic, see{' '}
        <ArticleLink slug="blockdag">BlockDAG</ArticleLink>.
      </p>
    </div>
  ),
}

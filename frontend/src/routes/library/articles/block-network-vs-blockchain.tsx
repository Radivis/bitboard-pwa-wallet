import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'block-network-vs-blockchain',
  title: 'The difference between a block network and a blockchain',
  tagIds: ['blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Not every mined block ends up in &quot;the blockchain.&quot; Picture all mined blocks as a
          tree with many branches. The blockchain is just one path through that tree—the branch
          everyone agrees is the &quot;official&quot; history. The other branches are real blocks
          that simply lost the race.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>block network</strong> is the collection of all blocks that have ever been
          successfully mined and propagated. Each block points to a parent via a{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">cryptographic hash</ArticleLink>, so
          you can picture every known block as a node and every parent link as an edge. In Bitcoin
          that graph is usually a tree rooted at the genesis block.
        </p>
        <p>
          The <strong>blockchain</strong>—the canonical chain—is a single path through that graph:
          the line of blocks from genesis to the current tip that full nodes treat as authoritative
          (the valid chain with the most cumulative{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>).
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Stale or orphaned blocks on side branches are still real blocks—they just lost the race.
          They remain in a node&apos;s block index but are not part of the active chain. When a
          competing branch accumulates more work, nodes perform a{' '}
          <ArticleLink slug="what-is-a-blockchain-reorganization">blockchain reorganization</ArticleLink>
          , switching their view of the canonical tip.
        </p>
        <p>
          A different, protocol-level idea is a <strong>block DAG</strong>, where a design
          intentionally allows multiple parents per block instead of privileging a single linear
          chain—see <ArticleLink slug="blockdag">BlockDAG</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'block-network-vs-blockchain',
  title: 'The difference between a block network and a blockchain',
  tagIds: ['blockchain', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>block network</strong> (in the sense used here) is the collection of <strong>all
        blocks that have ever been successfully mined</strong> and propagated: each block points to a
        parent via a{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">cryptographic hash</ArticleLink>, so you
        can picture every known block as a <strong>node</strong> and every parent link as an{' '}
        <strong>edge</strong>. In Bitcoin that graph is usually a <strong>tree</strong> rooted at the
        genesis block: many paths branch outward as miners find competing blocks at similar heights.
      </p>
      <p>
        The <strong>blockchain</strong>—the &quot;official&quot; or <strong>canonical chain</strong>—is
        not the whole network. It is a <strong>single path</strong> through that graph: the line of
        blocks from genesis to the <strong>current tip</strong> that full nodes currently treat as
        authoritative under the consensus rules (in practice, the valid chain with the most cumulative{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>).
      </p>
      <p>
        So there are always <strong>mined blocks that are not part of the official blockchain</strong>:
        stale or orphaned blocks on side branches that lost the race, or blocks that were once at the
        tip until a longer chain appeared. They are still real blocks; they are just not on the
        winning path. When the preferred path switches, nodes perform a{' '}
        <ArticleLink slug="what-is-a-blockchain-reorganization">
          blockchain reorganization
        </ArticleLink>
        .
      </p>
      <p>
        A different, protocol-level idea is a <strong>block DAG</strong>, where a design intentionally
        allows multiple parents per block instead of privileging a single linear chain—see{' '}
        <ArticleLink slug="blockdag">BlockDAG</ArticleLink>.
      </p>
    </div>
  ),
}

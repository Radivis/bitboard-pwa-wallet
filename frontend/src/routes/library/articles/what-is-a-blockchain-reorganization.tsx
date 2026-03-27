import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-blockchain-reorganization',
  title: 'What is a blockchain reorganization?',
  tagIds: ['blockchain', 'bitcoin', 'mining'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>chain reorganization</strong> (often called a <strong>reorg</strong>) happens when
        your node&apos;s view of the <strong>best valid chain</strong> changes: a different branch
        of blocks has more cumulative{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>, so the
        &quot;official&quot; path through the{' '}
        <ArticleLink slug="block-network-vs-blockchain">block network</ArticleLink> moves. Blocks that
        were at the tip of the old view are no longer on the canonical chain; they sit on an abandoned
        or shorter side branch.
      </p>
      <p>
        Reorgs are a normal part of <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> under
        decentralized mining: two miners can find valid blocks at nearly the same time, and the
        network temporarily disagrees on ordering until more work accumulates on one side. Shallow
        reorgs (typically one block, or a few) occur occasionally; very deep reorgs are unlikely for
        an attacker unless they control a large fraction of total hash power.
      </p>
      <p>
        For users and services, the practical lesson is <strong>confirmation depth</strong>: the more
        blocks built on top of a transaction, the more cumulative work would need to be undone to
        reverse it. Light clients and exchanges often wait for several confirmations before treating
        large amounts as settled.
      </p>
      <p>
        For how the full set of mined blocks relates to the single canonical path, see{' '}
        <ArticleLink slug="block-network-vs-blockchain">
          The difference between a block network and a blockchain
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

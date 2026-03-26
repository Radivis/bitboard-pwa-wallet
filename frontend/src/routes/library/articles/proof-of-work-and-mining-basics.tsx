import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'proof-of-work-and-mining-basics',
  title: 'Proof-of-work and mining (basics)',
  tagIds: ['mining', 'bitcoin', 'blockchain'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Proof-of-work (PoW)</strong> is how Bitcoin reaches agreement on which transactions
        count without a central referee. Participants called <strong>miners</strong> bundle pending
        transactions into a candidate <strong>block</strong> and search for a special number (a{' '}
        <strong>nonce</strong>) such that when the block header is hashed (using SHA-256), the result
        is numerically below a network-wide <strong>difficulty</strong> target. Finding such a hash
        takes many tries; displaying a valid hash proves that a lot of computation was done—hence
        &quot;proof of work.&quot;
      </p>
      <p>
        The first miner to find a valid block broadcasts it; other nodes check the rules and accept it
        if valid. Roughly every ten minutes (on average) a new block extends the chain, ordering
        transactions into shared history. The protocol adjusts difficulty so that pace stays stable
        as total mining power changes.
      </p>
      <p>
        PoW makes rewriting old history expensive: an attacker would need to redo the work for every
        block they want to replace. For how hashes are used in blocks, see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        . For miner incentives, see{' '}
        <ArticleLink slug="fees-and-mining-rewards">Fees and mining rewards</ArticleLink> and{' '}
        <ArticleLink slug="miners-as-timing-servers">Miners as randomly selected timing servers</ArticleLink>
        .
      </p>
      <p>
        For the big picture, read <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}

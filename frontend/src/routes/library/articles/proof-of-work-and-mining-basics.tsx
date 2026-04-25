import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'proof-of-work-and-mining-basics',
  title: 'Proof-of-work and mining (basics)',
  tagIds: ['mining', 'bitcoin', 'blockchain'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Proof-of-work is a lottery where the ticket price is electricity. Miners compete to solve a
          math puzzle; the winner gets to add the next block of transactions and collect a reward.
          This process secures Bitcoin without needing a central authority.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Proof-of-work (PoW)</strong> is how Bitcoin reaches agreement on which transactions
          count. <strong>Miners</strong> bundle pending transactions into a candidate{' '}
          <strong>block</strong> and search for a <strong>nonce</strong> such that hashing the block
          header (SHA-256) produces a result below the <strong>difficulty</strong> target.
        </p>
        <p>
          The first miner to find a valid block broadcasts it; other nodes verify and accept it.
          Roughly every ten minutes a new block extends the chain. The protocol adjusts difficulty so
          this pace stays stable as total mining power changes.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Finding a valid hash takes many tries—displaying one proves significant computation was
          done, hence &quot;proof of work.&quot; This cost limits{' '}
          <ArticleLink slug="sybil-attacks-and-countermeasures">Sybil-style</ArticleLink> influence:
          identities are cheap, but valid blocks are not. PoW also makes rewriting history expensive—
          an attacker would need to redo the work for every block they want to replace.
        </p>
        <p>
          For how hashes are used in blocks, see{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
            Hashes and Merkle trees in Bitcoin
          </ArticleLink>
          . For miner incentives, see{' '}
          <ArticleLink slug="fees-and-mining-rewards">Fees and mining rewards</ArticleLink> and{' '}
          <ArticleLink slug="miners-as-timing-servers">
            Miners as randomly selected timing servers
          </ArticleLink>
          . For the big picture, read <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

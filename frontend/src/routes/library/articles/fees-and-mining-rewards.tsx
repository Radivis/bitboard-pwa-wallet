import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'fees-and-mining-rewards',
  title: 'Fees and mining rewards',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Miners earn money two ways: newly minted bitcoin (the block subsidy) and fees paid by users
          who want their transactions included. Think of fees as a tip to cut in line—higher fees get
          faster confirmation when blocks are full.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Miners collect the <strong>block subsidy</strong> (new coins issued per block,{' '}
          <ArticleLink slug="what-is-a-halving-exactly">halving</ArticleLink> over time) and{' '}
          <strong>transaction fees</strong> paid by users whose transactions are included. For how
          mining works, see{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">
            Proof-of-work and mining (basics)
          </ArticleLink>
          .
        </p>
        <p>
          Fees incentivize miners to prioritize scarce block space efficiently. Users compete with{' '}
          <strong>fee rates</strong> (satoshis per virtual byte). Wallets estimate appropriate rates
          based on <strong>mempool</strong> conditions—the pool of unconfirmed transactions—and how
          quickly you want confirmation.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Block weight (not raw size) determines how many transactions fit. SegWit transactions get a
          discount on witness data, so fee estimation uses &quot;virtual bytes&quot; (vbytes). Miners
          typically sort transactions by fee rate and fill blocks greedily, though strategies vary.
        </p>
        <p>
          Long term, as the subsidy shrinks toward zero, fees are expected to carry more of
          miners&apos; revenue—a deliberate design choice in Bitcoin&apos;s economics. For how mining
          orders blocks in time, see{' '}
          <ArticleLink slug="miners-as-timing-servers">
            Miners as randomly selected timing servers
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

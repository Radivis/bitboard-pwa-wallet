import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-halving-exactly',
  title: 'What is a halving exactly?',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>halving</strong> (sometimes called <strong>halvening</strong> informally) is the
        event when Bitcoin&apos;s <strong>block subsidy</strong>—the new coins minted in each mined
        block—is cut in half. The rules are fixed in the protocol: roughly every 210,000 blocks (about
        four years at ten minutes per block on average), the subsidy steps down until it eventually
        reaches zero in the distant future.
      </p>
      <p>
        The subsidy is not a marketing knob; it is how the network bootstrapped security while
        distribution was ongoing. Each halving reduces the <strong>inflation rate</strong> of new
        bitcoin entering circulation from mining. The same change does not affect transaction fees,
        which are set by users and markets for block space.
      </p>
      <p>
        Halvings are predictable: nodes enforce the schedule, and miners plan around the subsidy plus
        fees as revenue. For how miners are paid overall, see{' '}
        <ArticleLink slug="fees-and-mining-rewards">Fees and mining rewards</ArticleLink> and{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work and mining (basics)</ArticleLink>
        .
      </p>
    </div>
  ),
}

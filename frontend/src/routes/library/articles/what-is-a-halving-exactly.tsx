import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-halving-exactly',
  title: 'What is a halving exactly?',
  tagIds: ['mining', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A halving is when the reward for mining a Bitcoin block gets cut in half—like a scheduled
          pay cut that happens roughly every four years. It is how Bitcoin controls its supply and
          gradually reduces new coin creation toward zero.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>halving</strong> is when Bitcoin&apos;s <strong>block subsidy</strong>—new coins
          minted per block—is cut in half. The rules are fixed: roughly every 210,000 blocks (about
          four years), the subsidy steps down until it eventually reaches zero.
        </p>
        <p>
          Each halving reduces the <strong>inflation rate</strong> of new bitcoin entering
          circulation. Transaction fees are unaffected—those are set by users and markets for block
          space.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The subsidy is how the network bootstrapped security while distribution was ongoing.
          Halvings are predictable: nodes enforce the schedule, and miners plan around subsidy plus
          fees as revenue. The final bitcoin will be mined around the year 2140.
        </p>
        <p>
          For how miners are paid, see{' '}
          <ArticleLink slug="fees-and-mining-rewards">Fees and mining rewards</ArticleLink> and{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">
            Proof-of-work and mining (basics)
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

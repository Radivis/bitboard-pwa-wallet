import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-bitcoin-was-a-revolution',
  title: 'Why Bitcoin represented a true revolution',
  tagIds: ['history', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Bitcoin was the first system to achieve digital scarcity without a central authority. For
          the first time, you could own and transfer value over the internet without trusting a bank
          or company—enforced purely by math and economic incentives.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Bitcoin combined existing ideas—public-key cryptography,{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">Merkle trees</ArticleLink>, and{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>—into a
          system for peer-to-peer electronic cash without trusted intermediaries. Scarcity and
          ownership are enforced by open-source rules and economic incentives rather than physical
          possession.
        </p>
        <p>
          It launched a new field of decentralized networks and inspired later cryptocurrencies and
          layers, while retaining a conservative base layer focused on security and verification.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The breakthrough was solving the double-spend problem without a central coordinator.
          Proof-of-work mining creates a costly barrier to rewriting history, while the longest-chain
          rule gives everyone an objective way to agree on transaction order.
        </p>
        <p>
          For technical milestones, see <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

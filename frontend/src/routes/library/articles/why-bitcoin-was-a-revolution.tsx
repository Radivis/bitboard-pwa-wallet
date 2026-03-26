import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-bitcoin-was-a-revolution',
  title: 'Why Bitcoin represented a true revolution',
  tagIds: ['history', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Bitcoin combined existing ideas—public-key cryptography, Merkle trees (see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        ), and <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work</ArticleLink>—into a
        system for peer-to-peer electronic cash without trusted intermediaries. For the first time at
        global scale, scarcity and ownership could be enforced by open-source rules and economic
        incentives rather than by physical possession alone.
      </p>
      <p>
        It launched a new field of decentralized networks and inspired later cryptocurrencies and
        layers, while retaining a conservative base layer focused on security and verification.
      </p>
      <p>
        For technical milestones on chain, see <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
        <ArticleLink slug="taproot">Taproot</ArticleLink>.
      </p>
    </div>
  ),
}

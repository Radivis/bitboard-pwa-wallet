import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'taproot',
  title: 'Taproot',
  tagIds: ['soft-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Taproot (BIP 341) activated in 2021 as a soft fork. It introduced a new output type (P2TR)
        that combines Schnorr signatures, Merkleized script paths, and key-path spending so that many
        contract cases can look like a single public key spend on chain when possible.
      </p>
      <p>
        That improves privacy and efficiency: cooperative spends do not reveal complex scripts, and
        fee savings accrue from smaller witnesses in common cases.
      </p>
      <p>
        Taproot builds on earlier upgrades such as <ArticleLink slug="segwit">SegWit</ArticleLink>.
        For the network&apos;s overall design, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}

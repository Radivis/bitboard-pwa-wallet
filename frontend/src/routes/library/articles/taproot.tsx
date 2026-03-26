import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'taproot',
  title: 'Taproot',
  tagIds: ['soft-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Taproot</strong> (BIP 341) activated in 2021 as a{' '}
        <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft fork</ArticleLink>. It
        introduced a new output type (<strong>P2TR</strong>, &quot;Pay to Taproot&quot;) that combines
        Schnorr signatures, <strong>Merkleized</strong> alternative script paths (see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">Hashes and Merkle trees in Bitcoin</ArticleLink>
        ), and <strong>key-path spending</strong>. When everyone cooperates, a spend can look like a
        simple single-signature payment on chain even if more complex conditions existed as fallback
        scripts.
      </p>
      <p>
        That improves privacy and efficiency: cooperative spends do not reveal complex scripts, and
        witness sizes shrink in common cases, which can reduce fees.
      </p>
      <p>
        Taproot builds on earlier upgrades such as <ArticleLink slug="segwit">SegWit</ArticleLink>. For
        the network&apos;s overall design, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
      </p>
    </div>
  ),
}

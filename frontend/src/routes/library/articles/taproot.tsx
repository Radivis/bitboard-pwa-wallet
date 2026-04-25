import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'taproot',
  title: 'Taproot',
  tagIds: ['soft-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Taproot is a Bitcoin upgrade that makes complex transactions look simple on the blockchain.
          Think of it like a contract with a handshake option: if everyone agrees, you just shake
          hands (simple signature); if there is a dispute, you reveal the detailed contract terms.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Taproot</strong> (BIP 341) activated in 2021 as a{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft fork</ArticleLink>
          . It introduced <strong>P2TR</strong> (&quot;Pay to Taproot&quot;) outputs that combine
          Schnorr signatures and <strong>key-path spending</strong>. When everyone cooperates, a
          spend looks like a simple single-signature payment even if complex fallback scripts exist.
        </p>
        <p>
          This improves privacy and efficiency: cooperative spends do not reveal complex scripts, and
          witness sizes shrink, which can reduce fees.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Taproot uses <strong>Merkleized</strong> alternative script paths (see{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
            Hashes and Merkle trees in Bitcoin
          </ArticleLink>
          ): the output commits to a public key and a Merkle root of possible scripts. Spending via
          key-path reveals nothing about scripts; spending via script-path reveals only the used
          branch.
        </p>
        <p>
          Taproot builds on <ArticleLink slug="segwit">SegWit</ArticleLink>. For the network&apos;s
          overall design, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

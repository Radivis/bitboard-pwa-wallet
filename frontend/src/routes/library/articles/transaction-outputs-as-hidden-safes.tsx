import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'transaction-outputs-as-hidden-safes',
  title: 'Transaction outputs as hidden safes',
  tagIds: ['bitcoin', 'blockchain', 'cryptography', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Each Bitcoin output is like a safe with a puzzle lock. Anyone can see the safe exists and
          how much is inside, but only someone who knows the secret (your private key) can open it.
          The puzzle is visible; the solution is not.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Each <ArticleLink slug="what-is-a-utxo">transaction output</ArticleLink> is like a{' '}
          <strong>safe</strong> holding bitcoin until someone spends it. The chain records the safe
          and its value—not a bank-style balance for a name.
        </p>
        <p>
          To move funds, a spender must: (1) know <strong>which</strong> outputs are theirs by
          tracking addresses their wallet generated, and (2) prove control with the right{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">private keys</ArticleLink> and a
          valid <ArticleLink slug="cryptographic-signatures">signature</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          In common output types (P2PKH, P2WPKH), what appears on chain is not your full{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> public key but a{' '}
          <strong>hash</strong> of it—see{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
            Hashes and Merkle trees in Bitcoin
          </ArticleLink>
          . Until you spend, observers see only a short commitment, not the curve point itself.
        </p>
        <p>
          This keeps the on-chain footprint smaller and avoids publishing the public key until
          needed. The full public key appears when you unlock the safe—along with the signature. For
          how witness data is structured, see <ArticleLink slug="segwit">SegWit</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'cryptographic-algorithms-in-bitcoin',
  title: 'Cryptographic algorithms used in Bitcoin',
  tagIds: ['cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Bitcoin uses several building blocks you may see named in documentation.{' '}
        <strong>SHA-256</strong> is a hash function: it produces a fixed-size fingerprint of data. It is
        used in <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work mining</ArticleLink>{' '}
        and, doubled (SHA256(SHA256(x))), for many identifiers. For what hashes and Merkle trees are
        for, see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        .
      </p>
      <p>
        <strong>ECDSA</strong> (Elliptic Curve Digital Signature Algorithm) and <strong>Schnorr</strong>{' '}
        signatures let you prove you know a private key without revealing it. Both work on the
        secp256k1 curve used in Bitcoin. <strong>Taproot</strong> builds on Schnorr for more compact
        multisignature-style authorizations and script features; see{' '}
        <ArticleLink slug="taproot">Taproot</ArticleLink>.
      </p>
      <p>
        <strong>Asymmetric cryptography</strong> means two related keys: a private key stays secret; a
        public key can be shared. Others can verify your signatures against the public key; only you
        can create valid signatures for your private key.
      </p>
      <p>
        For the curve Bitcoin uses, see{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> and{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

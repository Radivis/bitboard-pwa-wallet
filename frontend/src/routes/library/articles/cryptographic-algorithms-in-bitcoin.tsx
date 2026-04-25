import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'cryptographic-algorithms-in-bitcoin',
  title: 'Cryptographic algorithms used in Bitcoin',
  tagIds: ['cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Bitcoin relies on a handful of well-studied cryptographic tools: hash functions that create
          unique fingerprints of data, and digital signatures that prove ownership without revealing
          secrets. These building blocks make the entire system tamper-evident and secure.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>SHA-256</strong> is a hash function that produces a fixed-size fingerprint of any
          data. It is used in{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work mining</ArticleLink> and,
          doubled (SHA256(SHA256(x))), for many identifiers. For what hashes and Merkle trees are
          for, see{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
            Hashes and Merkle trees in Bitcoin
          </ArticleLink>
          .
        </p>
        <p>
          <ArticleLink slug="ecdsa">ECDSA</ArticleLink> (Elliptic Curve Digital Signature Algorithm)
          and <ArticleLink slug="schnorr-signatures">Schnorr</ArticleLink>{' '}
          <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink> let you prove you
          know a private key without revealing it. Both work on the{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve used in Bitcoin.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Asymmetric cryptography</strong> uses two related keys: a private key stays secret;
          a public key can be shared. Signatures are mathematical proofs binding a message to the
          private key—anyone with the public key can verify, but only the key holder can sign.
        </p>
        <p>
          <strong>Taproot</strong> builds on Schnorr for more compact multisignature-style
          authorizations and advanced script features; see{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink>. For the curve Bitcoin uses, see{' '}
          <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink>,{' '}
          <ArticleLink slug="what-is-secp256k1">What is secp256k1?</ArticleLink>, and{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

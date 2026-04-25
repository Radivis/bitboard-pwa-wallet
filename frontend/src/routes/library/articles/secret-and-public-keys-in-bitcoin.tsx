import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'secret-and-public-keys-in-bitcoin',
  title: 'Secret and public keys in Bitcoin',
  tagIds: ['elliptic-curves', 'cryptography', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A private key is like a secret combination to a safe; a public key is like the safe&apos;s
          address that anyone can send money to. You share the public key (or addresses derived from
          it); you guard the private key, which is needed to spend.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>private key</strong> (also called a <strong>secret key</strong>) is a large
          random number. From it, wallet software derives a <strong>public key</strong> using
          elliptic-curve math on the{' '}
          <ArticleLink slug="what-is-secp256k1">secp256k1</ArticleLink> curve. You share{' '}
          <strong>addresses</strong> (often encoded forms of scripts or public keys); you never share
          the private key, which is required to authorize spends with a{' '}
          <ArticleLink slug="cryptographic-signatures">digital signature</ArticleLink>.
        </p>
        <p>
          <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink> derive
          many keys from one master seed so one backup phrase can restore a whole wallet tree.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Hashed addresses hide the full public key on chain until a spend—see{' '}
          <ArticleLink slug="transaction-outputs-as-hidden-safes">
            Transaction outputs as hidden safes
          </ArticleLink>
          .{' '}
          <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">Descriptors</ArticleLink>{' '}
          are a text format that describes how keys and scripts fit together—helpful for recovery and
          advanced setups. For the extended public export that can derive many addresses, see{' '}
          <ArticleLink slug="what-is-an-xpub">What is an xpub?</ArticleLink>
        </p>
        <p>
          Losing the private key or seed means losing access to funds; leaking it means anyone can
          steal them. For curve background, see{' '}
          <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink> and{' '}
          <ArticleLink slug="what-is-secp256k1">What is secp256k1?</ArticleLink>. For wallet
          concepts, see <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'secret-and-public-keys-in-bitcoin',
  title: 'Secret and public keys in Bitcoin',
  tagIds: ['elliptic-curves', 'cryptography', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>private key</strong> (also called a <strong>secret key</strong>) is a large random
        number. From it, wallet software derives a <strong>public key</strong> using elliptic-curve
        math on the secp256k1 curve—you can think of the public key as a derived &quot;lock&quot; that
        pairs with your secret &quot;key.&quot; You share <strong>addresses</strong> (often encoded
        forms of scripts or public keys); you never share the private key, which is required to
        authorize spends with a{' '}
        <ArticleLink slug="cryptographic-signatures">digital signature</ArticleLink>.
      </p>
      <p>
        <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink> (hierarchical
        deterministic) derive many keys from one master seed so one backup phrase can restore a whole
        wallet tree.{' '}
        <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">Descriptors</ArticleLink> are a
        text format that describes how keys and scripts fit together—helpful for recovery and advanced
        setups.
      </p>
      <p>
        Losing the private key or seed means losing access to funds; leaking it means anyone who has it
        can steal them. Treat backups like secrets with physical consequences.
      </p>
      <p>
        For curve background, see{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">What is an elliptic curve?</ArticleLink>. For
        wallet concepts, see <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
      </p>
    </div>
  ),
}

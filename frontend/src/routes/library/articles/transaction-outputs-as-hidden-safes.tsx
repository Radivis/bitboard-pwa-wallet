import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'transaction-outputs-as-hidden-safes',
  title: 'Transaction outputs as hidden safes',
  tagIds: ['bitcoin', 'blockchain', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A useful mental model: each <ArticleLink slug="what-is-a-utxo">transaction output</ArticleLink>{' '}
        is like a <strong>safe</strong> holding a specific amount of bitcoin until someone spends it.
        The chain records the safe and its value; it does not store a bank-style running balance for a
        person&apos;s name.
      </p>
      <p>
        To move those funds, a spender must do two different things. First, they must know{' '}
        <strong>which</strong> outputs are theirs—usually by tracking <strong>addresses</strong> (or
        scripts) their wallet generated so they can find their safes on the ledger. Second, they must
        prove control with the right <ArticleLink slug="secret-and-public-keys-in-bitcoin">private keys</ArticleLink>{' '}
        and a valid <ArticleLink slug="cryptographic-signatures">signature</ArticleLink>. Needing keys
        feels natural: it is the key that turns the lock.
      </p>
      <p>
        The subtler part is the <strong>address</strong>. In common output types (for example{' '}
        <strong>pay-to-public-key-hash</strong> and SegWit <strong>pay-to-witness-public-key-hash</strong>
        ), what appears on chain is not your full{' '}
        <ArticleLink slug="what-is-an-elliptic-curve">secp256k1</ArticleLink> public key but a{' '}
        <strong>hash</strong> of it (or of a script)—see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">Hashes and Merkle trees in Bitcoin</ArticleLink>
        . Until you spend, observers see a short commitment that identifies the locking condition, not
        the curve point itself among the astronomically many possibilities.
      </p>
      <p>
        That design has several effects: it keeps the on-chain footprint smaller, and it avoids
        publishing the public key until a spend. The full public key (or witness program details)
        appears when you unlock the safe—along with the signature that proves you knew the secret. For
        how witness data is structured in modern transactions, see{' '}
        <ArticleLink slug="segwit">SegWit</ArticleLink>.
      </p>
    </div>
  ),
}

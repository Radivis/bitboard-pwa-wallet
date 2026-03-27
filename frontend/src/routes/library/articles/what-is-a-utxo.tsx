import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-utxo',
  title: 'What is a UTXO?',
  tagIds: ['bitcoin', 'blockchain'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>UTXO</strong> stands for <strong>unspent transaction output</strong>. Bitcoin&apos;s
        ledger does not store an account balance like a bank row that says &quot;Alice: 1.5 BTC.&quot;
        Instead, the chain records <strong>outputs</strong>: chunks of value created by past
        transactions. A <strong>spend</strong> consumes one or more existing outputs and creates new
        ones for recipients (and often <strong>change</strong> back to yourself).
      </p>
      <p>
        Your wallet&apos;s &quot;balance&quot; is the sum of <strong>UTXOs</strong> you can unlock with
        your keys—outputs that have not yet been spent. When you pay someone, you reference specific
        UTXOs as inputs, prove you may spend them with{' '}
        <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink>, and define new outputs
        that become the next generation of UTXOs. For an intuition that mixes addresses, hashes, and
        keys, see{' '}
        <ArticleLink slug="transaction-outputs-as-hidden-safes">
          Transaction outputs as hidden safes
        </ArticleLink>
        .
      </p>
      <p>
        This model makes validation clear: nodes check that inputs exist, signatures verify, and no
        input is used twice. For the big picture, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>
        ; for keys, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-utxo',
  title: 'What is a UTXO?',
  tagIds: ['bitcoin', 'blockchain'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A UTXO (unspent transaction output) is like a bill in your wallet—a specific chunk of value
          you can spend. Bitcoin does not track balances like a bank; it tracks individual
          &quot;bills&quot; you own and combines them when you pay.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>UTXO</strong> stands for <strong>unspent transaction output</strong>. Bitcoin&apos;s
          ledger records <strong>outputs</strong>: chunks of value created by past transactions. A{' '}
          <strong>spend</strong> consumes one or more existing outputs and creates new ones for
          recipients (and often <strong>change</strong> back to yourself).
        </p>
        <p>
          Your wallet&apos;s &quot;balance&quot; is the sum of UTXOs you can unlock with your keys.
          When you pay someone, you reference specific UTXOs as inputs, prove ownership with{' '}
          <ArticleLink slug="cryptographic-signatures">signatures</ArticleLink>, and define new
          outputs.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          This model makes validation clear: nodes check that inputs exist, signatures verify, and no
          input is used twice (no double-spending). For an intuition mixing addresses, hashes, and
          keys, see{' '}
          <ArticleLink slug="transaction-outputs-as-hidden-safes">
            Transaction outputs as hidden safes
          </ArticleLink>
          .
        </p>
        <p>
          For the big picture, see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>; for keys, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

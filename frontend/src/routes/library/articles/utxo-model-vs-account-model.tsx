import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'utxo-model-vs-account-model',
  title: 'UTXO Model vs. Account Model',
  tagIds: ['bitcoin', 'blockchain', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Cryptocurrencies track ownership in two main ways: the <strong>account model</strong>{' '}
          (balances tied to addresses, like a bank ledger) and the <strong>UTXO model</strong>{' '}
          (discrete &quot;coins&quot; that get consumed and created). Bitcoin deliberately chose
          UTXOs because they offer better <strong>baseline privacy</strong>—a design choice aligned
          with its origins as <strong>pseudonymous</strong> peer-to-peer electronic cash.
        </p>
      </ArticleSection>

      <ArticleSection title="The Account Model">
        <p>
          Many cryptocurrencies—most notably Ethereum—use an <strong>account model</strong>. Each
          address has a balance that increases or decreases with transactions, much like a bank
          account. This is intuitive: you see &quot;Address A has 5 ETH,&quot; and when A sends 2
          ETH, the balance becomes 3 ETH.
        </p>
        <p>
          <strong>Advantages:</strong> Simple mental model, efficient for smart contracts that need
          to read and update balances frequently, and straightforward state representation.
        </p>
        <p>
          <strong>Privacy cost:</strong> Your entire financial history accumulates at one address.
          Anyone who learns your address sees all incoming and outgoing transactions, your total
          balance, and can correlate your activity over time.
        </p>
      </ArticleSection>

      <ArticleSection title="The UTXO Model">
        <p>
          Bitcoin uses the <strong>UTXO model</strong> (see{' '}
          <ArticleLink slug="what-is-a-utxo">What is a UTXO?</ArticleLink>). Instead of balances,
          the system tracks individual &quot;coins&quot;—unspent outputs from previous transactions.
          Spending destroys one or more UTXOs and creates new ones.
        </p>
        <p>
          <strong>Advantages:</strong> Each transaction can use fresh addresses for change, making
          it harder to link activity. Parallel validation is straightforward because UTXOs are
          independent. Double-spend detection is simple—each UTXO can only be spent once.
        </p>
        <p>
          <strong>Complexity cost:</strong> Users (and wallets) must manage multiple UTXOs,
          understand change, and deal with{' '}
          <ArticleLink slug="dust-transactions">dust</ArticleLink> edge cases.
        </p>
      </ArticleSection>

      <ArticleSection title="Why Bitcoin Chose UTXOs: Privacy by Design">
        <p>
          Bitcoin was designed as <strong>peer-to-peer electronic cash</strong> with{' '}
          <strong>pseudonymous</strong> addressing on-chain—not strong anonymity by default. While
          neither model provides perfect privacy, the UTXO model offers significantly better{' '}
          <strong>baseline privacy</strong> out of the box:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Address rotation:</strong> Wallets naturally generate new addresses for each
            transaction&apos;s change output, fragmenting your activity across many addresses rather
            than concentrating it at one.
          </li>
          <li>
            <strong>No global balance:</strong> There is no single &quot;account&quot; that reveals
            your total holdings. An observer must link UTXOs through heuristics, which good wallet
            practices can defeat.
          </li>
          <li>
            <strong>Coin selection:</strong> Users can choose which UTXOs to spend, avoiding
            combining coins from different contexts that would reveal ownership links.
          </li>
        </ul>
        <p>
          With the account model, achieving similar privacy requires additional layers (mixers,
          shielded pools) on top. With UTXOs, careful wallet behavior alone can provide reasonable
          unlinkability.
        </p>
      </ArticleSection>

      <ArticleSection title="Both Models Can Work">
        <p>
          Neither model is strictly &quot;better.&quot; Ethereum&apos;s account model enables
          expressive smart contracts where persistent state is essential. Bitcoin&apos;s UTXO model
          is simpler at the consensus level and aligns with its privacy-first philosophy.
        </p>
        <p>
          The key insight: <strong>design reveals intent</strong>. Bitcoin&apos;s architecture
          optimizes for censorship resistance and privacy. Account-based chains optimize for
          programmability and developer convenience. Each approach has trade-offs, and both have
          proven viable at scale.
        </p>
      </ArticleSection>

      <ArticleSection title="Further Reading">
        <p>
          For how UTXOs work in practice, see{' '}
          <ArticleLink slug="what-is-a-utxo">What is a UTXO?</ArticleLink> and{' '}
          <ArticleLink slug="transaction-outputs-as-hidden-safes">
            Transaction outputs as hidden safes
          </ArticleLink>
          . For wallet address management, see{' '}
          <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD Wallets</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

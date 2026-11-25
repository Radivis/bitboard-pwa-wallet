import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'address-reuse-and-deanonymization',
  title: 'Address reuse and deanonymization',
  tagIds: ['privacy', 'wallets', 'bitcoin'],
  level: 3,
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Use a fresh receiving address for each payment. When the same address is paid more than
          once, those payments are publicly tied to one recipient. That link is{' '}
          <strong>address reuse</strong>, and it is one of the easiest ways observers deanonymize a
          wallet.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          An <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallet</ArticleLink>{' '}
          can derive a new address from the same seed whenever you need one. Privacy improves only
          if you actually hand out a new one. A few habits cover normal use:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Share an address, wait for that payment, then generate the next address before you
            share again. A receive count of 0 means the address is still fresh. A count of 1 is a
            normal single payment. A count of 2 or more is reuse.
          </li>
          <li>
            Do not publish one static address on a website, a profile, or a printed sign if you
            care who can link the payments. Every donation to that address shows the same
            recipient.
          </li>
          <li>
            Do not ask someone to &quot;use the same address as last time.&quot; That sentence is
            the reuse.
          </li>
          <li>
            Spending the coins does not clear the history. An address that once held funds and now
            shows 0 is still a used address.
          </li>
          <li>
            Change addresses are chosen by the wallet, and this app does not show them on the
            receive screen. They do show up if you paste a transaction id into a public explorer
            such as mempool.space: one output is the payment, and another is the change coming
            back. Copying that change output and handing it out joins the next payment to the spend
            that created it. That's exactly what you should not do.
          </li>
        </ul>
        <p>
          Rotating too far ahead of payments runs into a different limit. See{' '}
          <ArticleLink slug="the-gap-limit">The gap limit</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The blockchain is public. An address stands for a script, and every output that pays that
          script is visible to anyone who looks. Reuse does not reveal your seed and does not let a
          stranger spend the coins. It reveals that those payments went to one recipient.
        </p>
        <p>
          Deanonymization usually starts with a single labeled payment. A withdrawal from an
          exchange that knows your name, a payment you publicly acknowledged, or a donation page
          attaches a person to that address. Every other payment to the same address inherits the
          label. The observer did not break any cryptography. They followed a link you published by
          reusing the script.
        </p>
        <p>
          Spending makes the cluster larger. When a transaction spends several coins together,
          observers often treat every input as belonging to the same wallet. Coins that arrived at
          a reused address are already tied to each other. Spending them next to coins that arrived
          at fresh addresses pulls those fresh addresses into the same cluster. One labeled payment
          can then name a much wider set of activity.
        </p>
        <p>
          For the coins themselves, see <ArticleLink slug="what-is-a-utxo">What is a UTXO?</ArticleLink>
          . Asking an indexer about your addresses is a separate leak, covered in{' '}
          <ArticleLink slug="esplora-privacy">Esplora privacy</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

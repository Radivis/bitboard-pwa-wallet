import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-cryptocurrency-exactly',
  title: 'What is a cryptocurrency exactly?',
  tagIds: ['cryptocurrencies', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A cryptocurrency is internet-native money: digital value that you can send to anyone
          without a bank in the middle. Math and software replace the bank clerk—cryptography proves
          you own it, and shared rules prevent cheating.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          A <strong>cryptocurrency</strong> is a digital asset whose ownership and transfers are
          enforced by cryptography and shared rules rather than by physical possession or a single
          company. Many participants run compatible software; together they agree on balances and
          transaction order so everyone sees the same history.
        </p>
        <p>
          Most cryptocurrencies rely on a <strong>shared ledger</strong> (often a{' '}
          <strong>blockchain</strong>), <strong>peer-to-peer networking</strong>, and{' '}
          <strong>economic incentives</strong>—like{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work mining</ArticleLink>{' '}
          rewards—to keep the system honest.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The blockchain is a chain of blocks, each bundling recent transactions and linking to the
          previous block via cryptographic hashes. Nodes relay data without a central server.
          Economic incentives align participants toward honest behavior even when they do not trust
          each other.
        </p>
        <p>
          Bitcoin was the first widely deployed example. See{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for how it works in practice, and{' '}
          <ArticleLink slug="why-is-bitcoin-so-complicated">Why is Bitcoin so complicated?</ArticleLink>{' '}
          for why the machinery is intricate.
        </p>
      </ArticleSection>
    </div>
  ),
}

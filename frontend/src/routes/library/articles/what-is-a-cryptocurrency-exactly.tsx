import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-cryptocurrency-exactly',
  title: 'What is a cryptocurrency exactly?',
  tagIds: ['cryptocurrencies', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        If you are new to the topic, think of a cryptocurrency as <strong>internet-native money</strong>
        : rules written in software define who owns what and who can transfer value. There are no
        physical coins; ownership is recorded digitally. Math-based locks (cryptography) and
        network rules replace the role of a bank clerk or cashier checking your identity at a counter.
      </p>
      <p>
        A <strong>cryptocurrency</strong> is a digital asset whose ownership and transfers are enforced
        by cryptography and shared rules rather than by physical possession or a single company. Many
        participants run compatible software; together they agree on balances and the order of
        transactions so that everyone sees the same history.
      </p>
      <p>
        Most cryptocurrencies rely on a <strong>shared ledger</strong> (often implemented as a{' '}
        <strong>blockchain</strong>: a chain of blocks, each bundling recent transactions and linking
        to the previous block). They also use <strong>peer-to-peer networking</strong> so nodes can
        relay data without one central server, and <strong>economic incentives</strong>—for example
        rewards for people who help secure the network through{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work mining</ArticleLink> or,
        in other systems, staking—to keep the system honest at scale.
      </p>
      <p>
        Bitcoin was the first widely deployed example. For how it combines these pieces in practice,
        see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>. For why the machinery behind that goal
        is intricate, see{' '}
        <ArticleLink slug="why-is-bitcoin-so-complicated">Why is Bitcoin so complicated?</ArticleLink>.
      </p>
    </div>
  ),
}

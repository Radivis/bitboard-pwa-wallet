import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-cryptocurrency-exactly',
  title: 'What is a cryptocurrency exactly?',
  tagIds: ['cryptocurrencies', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A cryptocurrency is a digital asset whose ownership and transfers are enforced by
        cryptography and network rules rather than physical possession or a single administrator.
        Participants run software that agrees on balances and transaction order.
      </p>
      <p>
        Most cryptocurrencies use a shared ledger (often a blockchain), peer-to-peer networking, and
        economic incentives (such as mining or staking) to secure the system.
      </p>
      <p>
        Bitcoin was the first widely deployed example; see <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>{' '}
        for how it combines these pieces in practice.
      </p>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-different-bitcoin-test-networks',
  title: 'Why are there different test networks for Bitcoin?',
  tagIds: ['test-networks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Test networks use valueless coins so developers and users can experiment without risking real
        funds. Different testnets exist because requirements evolved: stability, faucet availability,
        reset history, and compatibility with new features (like Taproot) differ over time.
      </p>
      <p>
        Signet offers a more predictable block production model operated by signers; earlier testnets
        relied more on traditional mining with lower security assumptions. Tooling and community
        focus gradually shift as ecosystems adopt newer networks.
      </p>
      <p>
        Always use addresses and explorers that match the network your wallet is configured for. See{' '}
        <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for mainnet concepts that parallel test
        usage.
      </p>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-different-bitcoin-test-networks',
  title: 'Why are there different test networks for Bitcoin?',
  tagIds: ['test-networks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Test networks (testnets)</strong> use coins with no real-world value so developers and
        users can experiment without risking <strong>mainnet</strong> funds (the live Bitcoin
        network). Different testnets exist because requirements evolved: stability,{' '}
        <strong>faucet</strong> availability (services that give away free test coins), reset history,
        and compatibility with new features differ over time.
      </p>
      <p>
        <strong>Signet</strong> offers a more predictable block production model operated by signers;
        earlier testnets relied more on traditional mining with lower security assumptions. Tooling
        and community focus gradually shift as ecosystems adopt newer networks. When testing newer
        consensus features (for example <ArticleLink slug="taproot">Taproot</ArticleLink>), you need a
        network whose rules support them.
      </p>
      <p>
        Always use addresses and explorers that match the network your wallet is configured for. See{' '}
        <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for mainnet concepts that parallel test
        usage.
      </p>
    </div>
  ),
}

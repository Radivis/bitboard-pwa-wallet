import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-different-bitcoin-test-networks',
  title: 'Why are there different test networks for Bitcoin?',
  tagIds: ['test-networks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Test networks let developers experiment without risking real money. Different testnets
          exist because requirements evolved—some prioritize stability, others support newer features
          or have more reliable faucets for getting test coins.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Test networks (testnets)</strong> use coins with no real-world value so developers
          and users can experiment without risking <strong>mainnet</strong> funds. Different testnets
          exist because stability, <strong>faucet</strong> availability, reset history, and feature
          compatibility differ over time.
        </p>
        <p>
          Always use addresses and explorers that match the network your wallet is configured for.
          See <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> for mainnet concepts.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          <strong>Signet</strong> offers predictable block production operated by designated signers,
          avoiding the chaos of low-hashrate mining. Earlier testnets relied on traditional mining
          with lower security assumptions. When testing newer features like{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink>, you need a network whose rules support
          them.
        </p>
        <p>
          Tooling and community focus gradually shift as ecosystems adopt newer networks. Testnet3
          has been running since 2012; Signet was introduced with Bitcoin Core 0.21.
        </p>
      </ArticleSection>
    </div>
  ),
}

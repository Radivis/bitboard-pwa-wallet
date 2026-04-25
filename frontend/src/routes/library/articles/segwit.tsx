import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'segwit',
  title: 'SegWit',
  tagIds: ['bitcoin', 'soft-forks', 'history'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          SegWit (Segregated Witness) is a Bitcoin upgrade that reorganized how transaction data is
          stored. Think of it like reorganizing a filing cabinet—the same documents, but arranged
          more efficiently so you can fit more and find things faster.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Segregated Witness</strong> was deployed as a{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft fork</ArticleLink>
          . It moved <strong>witness data</strong> (signatures and unlocking information) so it is
          hashed separately for signing purposes. This changed how <strong>block weight</strong> is
          counted, allowing more economic activity per block.
        </p>
        <p>
          For users, SegWit means more efficient use of block space (often lower fees) and paved the
          way for layered protocols like Lightning. It is part of Bitcoin&apos;s on-chain history
          alongside <ArticleLink slug="taproot">Taproot</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The separation fixed <strong>transaction malleability</strong> in common patterns—third
          parties could previously tweak witness data without invalidating a transaction, which broke
          certain off-chain protocols. With SegWit, the transaction ID (txid) is computed without
          witness data, making it stable.
        </p>
        <p>
          SegWit sits in the broader story of <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>. If
          you are new to keys and addresses, read{' '}
          <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>. For hashes and Merkle
          structures, see{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
            Hashes and Merkle trees in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'segwit',
  title: 'SegWit',
  tagIds: ['bitcoin', 'soft-forks', 'history'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Segregated Witness (SegWit)</strong> was a consensus change deployed as a{' '}
        <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft fork</ArticleLink>: it
        moved <strong>witness data</strong> (signatures and related unlocking information) so it is
        hashed separately for signing purposes. That separation fixed <strong>transaction malleability</strong>{' '}
        in common patterns (third parties could sometimes tweak witness data without invalidating a
        transaction in older models) and changed how <strong>block weight</strong> is counted so more
        economic activity can fit in a block.
      </p>
      <p>
        For users, SegWit enables more efficient use of block space (lower fees for the same economic
        activity in many cases) and paved the way for layered protocols such as Lightning. It is part
        of Bitcoin&apos;s on-chain history alongside other upgrades.
      </p>
      <p>
        SegWit sits in the broader story of <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> as a
        network. If you are new to keys and addresses, read{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> next. For hashes and Merkle
        structures used elsewhere in Bitcoin, see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin-cash',
  title: 'Bitcoin Cash',
  tagIds: ['hard-forks', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Bitcoin Cash (BCH) is a separate cryptocurrency that split off from Bitcoin in 2017. Think
          of it like a corporate spin-off: shareholders at the time received stock in both companies,
          but the two now operate independently with different rules and leadership.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          The split happened over a disagreement about how to scale Bitcoin. One camp wanted larger
          blocks; the other preferred off-chain solutions like Lightning. At a specific block height,
          the networks diverged:{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">hard forks</ArticleLink>{' '}
          create independent ledgers where transactions and balances are no longer shared.
        </p>
        <p>
          Holders of bitcoin at the fork block received corresponding coins on both chains, but from
          that point the histories diverge. Wallets must use the correct network and address formats
          for each asset.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Bitcoin Cash increased the block size limit (initially to 8 MB, later to 32 MB) to fit more
          transactions per block. It also removed SegWit and later added features Bitcoin does not
          have. The chains share history up to block 478,558 (August 1, 2017), then permanently
          diverge.
        </p>
        <p>
          For the original network&apos;s design goals, see{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink>. For how consensus changes can occur
          without a permanent split, see <ArticleLink slug="segwit">SegWit</ArticleLink> and{' '}
          <ArticleLink slug="taproot">Taproot</ArticleLink> as{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft-fork</ArticleLink>{' '}
          examples.
        </p>
      </ArticleSection>
    </div>
  ),
}

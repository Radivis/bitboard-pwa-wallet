import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'how-many-addresses-can-a-bitcoin-wallet-have',
  title: 'How many addresses can a Bitcoin wallet have?',
  tagIds: ['wallets', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        In practice, a single wallet backup can support an enormous number of addresses. Modern
        wallets are usually <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink>
        : they derive many keys from one <strong>seed</strong>, and each key can be turned into one or
        more <strong>addresses</strong> depending on script type (legacy, SegWit, Taproot, and so on).
      </p>
      <p>
        Standards such as BIP-32 define hierarchical derivation: at each level, indices can range
        over very large spaces (commonly 2³² values per index). That means you are not limited to a
        handful of addresses—wallets can generate a fresh receiving address for every payment for
        privacy, and still recover everything from the same seed.
      </p>
      <p>
        There are limits in theory (finite index ranges, and practical scanning when you recover a
        wallet), but for normal use the answer is <strong>effectively unlimited</strong>: you will not
        hit a practical cap before other concerns (backup, fees, UX) matter more.
      </p>
      <p>
        For how keys relate to addresses in Bitcoin, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>{' '}
        and <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
      </p>
    </div>
  ),
}

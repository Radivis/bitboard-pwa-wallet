import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'how-many-addresses-can-a-bitcoin-wallet-have',
  title: 'How many addresses can a Bitcoin wallet have?',
  tagIds: ['wallets', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Effectively unlimited. A single seed phrase can generate billions of addresses—far more
          than you will ever need. You can use a fresh address for every payment (good for privacy)
          and still recover everything from one backup.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Modern wallets are usually{' '}
          <ArticleLink slug="what-are-hd-wallets-and-how-do-they-work">HD wallets</ArticleLink>: they
          derive many keys from one <strong>seed</strong>, and each key can produce one or more{' '}
          <strong>addresses</strong> depending on script type (legacy, SegWit, Taproot).
        </p>
        <p>
          Standards such as BIP-32 define hierarchical derivation: at each level, indices can range
          over very large spaces (commonly 2³² values per index). Wallets can generate a fresh
          receiving address for every payment and still recover everything from the same seed.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          There are limits in theory—finite index ranges and practical scanning time when recovering
          a wallet—but for normal use you will never hit them. Wallets typically use a &quot;gap
          limit&quot; (e.g., 20 unused addresses) to know when to stop scanning during recovery.
        </p>
        <p>
          For how keys relate to addresses, see{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>{' '}
          and <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

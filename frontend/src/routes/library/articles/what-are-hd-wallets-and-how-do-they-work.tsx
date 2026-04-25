import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-are-hd-wallets-and-how-do-they-work',
  title: 'What are HD wallets and how do they work?',
  tagIds: ['wallets', 'standards', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          An HD wallet generates all your keys from a single master secret—like a tree growing from
          one seed. Back up that seed (usually 12 or 24 words), and you can regrow the entire tree of
          addresses later on any compatible wallet.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          An <strong>HD wallet</strong> (hierarchical deterministic) derives many{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">keys</ArticleLink> from a single
          starting secret instead of generating unrelated keys one by one. The usual starting point
          is a <strong>master seed</strong> shown as a 12- or 24-word phrase (
          <strong>BIP-39</strong> mnemonic).
        </p>
        <p>
          <strong>Hierarchical</strong> means keys are grouped (accounts, coin types).{' '}
          <strong>Deterministic</strong> means the same seed always produces the same keys—critical
          for recovery. See{' '}
          <ArticleLink slug="how-many-addresses-can-a-bitcoin-wallet-have">
            How many addresses can a Bitcoin wallet have?
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          From the seed, wallets follow <strong>BIP-32</strong> to build a tree of keys along{' '}
          <strong>derivation paths</strong> like{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">m/84&apos;/0&apos;/0&apos;/0/0</code>
          . Prefixes describe purpose and account; trailing indices pick receive vs change addresses.
        </p>
        <p>
          HD schemes define <strong>extended keys</strong>: an{' '}
          <ArticleLink slug="what-is-an-xpub">xpub</ArticleLink> lets you generate receiving addresses
          without private keys—useful for watch-only wallets. See{' '}
          <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">
            Descriptors and descriptor wallets
          </ArticleLink>{' '}
          for backup formats, and <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink> for
          standards.
        </p>
      </ArticleSection>
    </div>
  ),
}

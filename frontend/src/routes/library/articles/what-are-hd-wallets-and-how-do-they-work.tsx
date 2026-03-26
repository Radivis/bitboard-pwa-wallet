import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-are-hd-wallets-and-how-do-they-work',
  title: 'What are HD wallets and how do they work?',
  tagIds: ['wallets', 'standards', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        An <strong>HD wallet</strong> (hierarchical deterministic wallet) derives many{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">private and public keys</ArticleLink> from
        a single starting secret, instead of generating unrelated keys one by one. If you back up that
        starting point correctly, you can later regenerate the same sequence of keys and addresses—so
        one backup can restore your whole wallet.
      </p>
      <p>
        The usual starting point is a <strong>master seed</strong>: random data that is often shown
        to you as a 12- or 24-word phrase (<strong>BIP-39</strong> mnemonic). From the seed, the
        wallet follows open standards (notably <strong>BIP-32</strong>) to build a <strong>tree</strong>{' '}
        of keys: a master key, then <strong>child</strong> keys along <strong>derivation paths</strong>
        . Paths look like{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">m/84&apos;/0&apos;/0&apos;/0/0</code>{' '}
        : prefixes describe purpose and account; trailing indices pick receive vs change addresses and
        individual addresses. Wallets hide this detail until you export or troubleshoot.
      </p>
      <p>
        <strong>Hierarchical</strong> means keys are grouped (for example separate accounts or
        coin types). <strong>Deterministic</strong> means given the same seed and path, every
        compliant wallet derives the same keys—important for recovery across devices and apps.
      </p>
      <p>
        HD schemes also define <strong>extended keys</strong>: data that includes a public or private
        key plus extra material so child keys can be derived. An <strong>xpub</strong> (extended public
        key) lets you generate receiving addresses and watch balances without holding private keys—useful
        for a watch-only copy. See{' '}
        <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">
          What are descriptors and descriptor wallets?
        </ArticleLink>{' '}
        for how this is often written down in backups.
      </p>
      <p>
        Standards for mnemonics, derivation, and common paths are documented as BIPs; see{' '}
        <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink>. For backup tradeoffs, see{' '}
        <ArticleLink slug="bitcoin-backup-techniques-overview">
          An overview of different backup techniques for Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

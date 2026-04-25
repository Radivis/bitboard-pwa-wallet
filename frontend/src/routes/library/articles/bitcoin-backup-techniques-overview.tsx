import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin-backup-techniques-overview',
  title: 'An overview of different backup techniques for Bitcoin',
  tagIds: ['backups', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A backup lets you recover your bitcoin if your device is lost, stolen, or broken. The most
          common method is writing down a seed phrase—a list of words that encodes your wallet&apos;s
          master secret. Think of it as a spare key to your house, but one that unlocks everything
          you own.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Common approaches include writing down a <strong>BIP-39</strong> seed phrase (12 or 24
          words encoding random data) on paper or metal, exporting{' '}
          <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptor</ArticleLink> or{' '}
          <ArticleLink slug="what-is-an-xpub">xpub</ArticleLink> material for watch-only recovery,
          and using multisig so loss of one key does not mean loss of funds.
        </p>
        <p>
          Each approach balances convenience, durability, and attack surface. Metal plates resist
          fire and water better than paper; digital files can be encrypted but introduce malware and
          duplication risks.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          A seed phrase is entropy encoded per BIP-39 with a checksum word. From this seed, wallets
          derive hierarchical key trees (BIP-32/44/84/86). Backing up only the seed lets you
          regenerate all addresses—but you need to know the derivation paths used. Output descriptors
          solve this by encoding both keys and derivation metadata in one string.
        </p>
        <p>
          An <ArticleLink slug="what-is-an-xpub">xpub</ArticleLink> lets a wallet derive many
          receiving addresses without holding private keys—useful for monitoring on a less trusted
          device. For multisig setups, you typically need all participant xpubs plus the script
          template to spend or even to find your funds.
        </p>
        <p>
          See <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink> for how standard backup
          formats are specified, and{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">
            Basics for keeping your keys safe
          </ArticleLink>{' '}
          for operational security habits.
        </p>
      </ArticleSection>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin-backup-techniques-overview',
  title: 'An overview of different backup techniques for Bitcoin',
  tagIds: ['backups', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Backups let you recover access if a device is lost or damaged. Common approaches include
        writing down a <strong>BIP-39</strong> seed phrase (a list of words encoding random data) on
        paper or metal, exporting{' '}
        <ArticleLink slug="what-are-descriptors-and-descriptor-wallets">descriptor</ArticleLink> or{' '}
        <ArticleLink slug="what-is-an-xpub">xpub</ArticleLink> (extended public key) material for
        watch-only recovery, and using multisig so loss of one key does not mean loss of funds. An{' '}
        <ArticleLink slug="what-is-an-xpub">xpub</ArticleLink> lets a wallet derive many receiving
        addresses without holding private keys—useful for monitoring on a less trusted device.
      </p>
      <p>
        Each approach balances convenience, durability, and attack surface. Metal plates resist fire
        and water better than paper; digital files can be encrypted but introduce malware and
        duplication risks.
      </p>
      <p>
        See <ArticleLink slug="what-is-a-bip">What is BIP?</ArticleLink> for how standard backup
        formats are specified, and{' '}
        <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping your keys safe</ArticleLink>{' '}
        for operational security habits.
      </p>
    </div>
  ),
}

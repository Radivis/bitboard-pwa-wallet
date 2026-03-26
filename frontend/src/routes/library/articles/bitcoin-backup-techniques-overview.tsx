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
        writing down a BIP-39 seed phrase on paper or metal, exporting descriptor or xpub material
        for watch-only recovery, and using multisig so loss of one key does not mean loss of funds.
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

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'basics-for-keeping-keys-safe',
  title: 'Basics for keeping your keys safe',
  tagIds: ['security', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Your keys control your bitcoin. Anyone who obtains a copy of your <strong>seed phrase</strong>,
        private keys, or wallet backup can potentially spend your funds. Treat backups like cash in a
        safe: limit copies, know where they are, and prefer offline storage for recovery material.
      </p>
      <p>
        Use reputable wallet software, verify downloads when possible, and be wary of phishing and
        fake &quot;support&quot; requests. Never share your seed or enter it into untrusted sites or
        apps. Remember: non-custodial wallets have no &quot;forgot password&quot; help desk on the
        blockchain.
      </p>
      <p>
        For how keys relate to addresses in Bitcoin, see{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">
          Secret and public keys in Bitcoin
        </ArticleLink>
        . For backup formats and tradeoffs, see{' '}
        <ArticleLink slug="bitcoin-backup-techniques-overview">
          An overview of different backup techniques for Bitcoin
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-bip',
  title: 'What is BIP?',
  tagIds: ['standards', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        BIP stands for Bitcoin Improvement Proposal. BIPs document proposed changes or conventions:
        consensus changes, peer-to-peer behavior, wallet interoperability (including mnemonic seeds
        and derivation paths), and informational guides.
      </p>
      <p>
        Not every BIP becomes part of Bitcoin Core or the wider ecosystem; some are experimental or
        optional. They are the main public coordination format for technical ideas around Bitcoin.
      </p>
      <p>
        Lightning uses a parallel naming scheme: see{' '}
        <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink>.
      </p>
    </div>
  ),
}

import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'what-is-a-bip',
  title: 'What is BIP?',
  tagIds: ['standards', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          BIP stands for Bitcoin Improvement Proposal. It is how the Bitcoin community documents and
          discusses technical changes—like a suggestion box with formal specifications that developers
          and users can review.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>BIP</strong> documents proposed changes or conventions:{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">
            consensus changes
          </ArticleLink>
          , peer-to-peer behavior, wallet interoperability (including mnemonic seeds and derivation
          paths), and informational guides.
        </p>
        <p>
          Not every BIP becomes part of Bitcoin Core or the wider ecosystem; some are experimental or
          optional. They are the main public coordination format for technical ideas around Bitcoin.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          BIPs have numbers and types (Standards Track, Informational, Process). Well-known examples
          include BIP-39 (mnemonic seed phrases), BIP-32 (HD wallets), BIP-141 (SegWit), and BIP-341
          (Taproot). Anyone can propose a BIP, but adoption depends on community review and
          implementation.
        </p>
        <p>
          Lightning uses a parallel naming scheme: see{' '}
          <ArticleLink slug="what-is-a-bolt">What is a BOLT?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

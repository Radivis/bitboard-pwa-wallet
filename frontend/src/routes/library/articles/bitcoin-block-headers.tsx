import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin-block-headers',
  title: 'Bitcoin block headers',
  tagIds: ['bitcoin', 'blockchain', 'mining'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>Bitcoin block header</strong> is an 80-byte structure that summarizes a block
        without listing every transaction. It is what miners repeatedly hash when searching for a
        valid proof-of-work: change the <strong>nonce</strong> (and rarely other fields), hash the
        header with SHA-256 twice, and compare the result to the current <strong>difficulty</strong>{' '}
        target. For how that search fits into mining, see{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work and mining (basics)</ArticleLink>
        .
      </p>
      <p>
        The header includes: a <strong>version</strong> field (consensus upgrades use version bits);
        the hash of the <strong>previous block</strong> header (linking this block into the chain);
        the <strong>Merkle root</strong> of all transactions in the block (a single commitment to
        the entire tx set); a <strong>timestamp</strong>; the compact-encoded <strong>nBits</strong>{' '}
        target; and the <strong>nonce</strong>. The <strong>block hash</strong> everyone quotes is
        the hash of this header (displayed with byte order conventions that tools like explorers
        follow).
      </p>
      <p>
        The Merkle root is how the header commits to transactions without embedding them: any change
        to a transaction changes the root. For Merkle trees and roots in Bitcoin, see{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        .
      </p>
      <p>
        For how the canonical chain is chosen among competing blocks, see{' '}
        <ArticleLink slug="block-network-vs-blockchain">
          The difference between a block network and a blockchain
        </ArticleLink>
        .
      </p>
    </div>
  ),
}

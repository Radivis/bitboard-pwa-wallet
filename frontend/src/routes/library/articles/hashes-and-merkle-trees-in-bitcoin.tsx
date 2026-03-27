import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'hashes-and-merkle-trees-in-bitcoin',
  title: 'Hashes and Merkle trees in Bitcoin',
  tagIds: ['cryptography', 'bitcoin', 'blockchain'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        A <strong>cryptographic hash function</strong> turns arbitrary data into a short, fixed-length
        fingerprint (a hash). The same input always yields the same hash; changing even one bit of
        the input typically changes the output completely. You cannot reconstruct the original data
        from the hash alone—that one-way behavior is what makes hashes useful for commitments and
        identifiers.
      </p>
      <p>
        Bitcoin uses SHA-256 widely. Miners repeatedly hash block headers when competing to extend the
        chain; many transaction and block identifiers are built from SHA-256 outputs as well. For how
        mining fits into the system, see{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">Proof-of-work and mining (basics)</ArticleLink>
        .
      </p>
      <p>
        A <strong>Merkle tree</strong> combines many pieces of data (for example, transactions in a
        block) by hashing them in pairs layer by layer until a single value remains: the{' '}
        <strong>Merkle root</strong>. That root commits to the entire set: if any transaction
        changes, the root changes. Light clients can verify inclusion of a specific item using a short
        path of sibling hashes instead of downloading everything.
      </p>
      <p>
        Merkle structures also appear in Taproot&apos;s script trees (Merkleized alternative scripts).
        For signature and key basics, see{' '}
        <ArticleLink slug="cryptographic-algorithms-in-bitcoin">
          Cryptographic algorithms used in Bitcoin
        </ArticleLink>{' '}
        and <ArticleLink slug="taproot">Taproot</ArticleLink>.
      </p>
    </div>
  ),
}

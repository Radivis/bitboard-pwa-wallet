import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin-block-headers',
  title: 'Bitcoin block headers',
  tagIds: ['bitcoin', 'blockchain', 'mining'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          A block header is a compact 80-byte summary of a Bitcoin block—like a label on a shipping
          container that tells you what is inside without opening it. Miners hash this header
          billions of times looking for a &quot;winning&quot; number, and nodes use headers to verify
          the chain without downloading every transaction.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          The header includes: a <strong>version</strong> field (consensus upgrades use version
          bits); the hash of the <strong>previous block</strong> header (linking this block into the
          chain); the <strong>Merkle root</strong> of all transactions in the block; a{' '}
          <strong>timestamp</strong>; the compact-encoded <strong>nBits</strong> target; and the{' '}
          <strong>nonce</strong>. The <strong>block hash</strong> everyone quotes is the double
          SHA-256 of this header.
        </p>
        <p>
          Miners repeatedly tweak the nonce (and sometimes other fields), hash the header, and check
          if the result is below the difficulty target. For how that search fits into mining, see{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">
            Proof-of-work and mining (basics)
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The Merkle root commits to the full transaction set: changing any transaction changes the
          root, which changes the header hash, invalidating any proof-of-work already done. This
          binding is what makes blocks tamper-evident. See{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
            Hashes and Merkle trees in Bitcoin
          </ArticleLink>
          .
        </p>
        <p>
          Because each header contains the previous header&apos;s hash, headers form a chain. Light
          clients can download only headers (80 bytes each vs. megabytes of full blocks) to verify
          proof-of-work and request specific transactions via Merkle proofs. For how the canonical
          chain is chosen among competing blocks, see{' '}
          <ArticleLink slug="block-network-vs-blockchain">
            The difference between a block network and a blockchain
          </ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

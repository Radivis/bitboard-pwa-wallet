import { ArticleLink } from '@/lib/library/article-shared'
import { cn } from '@/lib/utils'

/**
 * Rich Infomode body for the Lab block header card. No-props component for InfomodeRegistry.
 */
export function LabBlockHeaderInfomodeContent() {
  return (
    <div
      className={cn(
        'space-y-3 pr-1 text-sm leading-relaxed',
        '[&_.text-primary]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline',
      )}
    >
      <p className="text-popover-foreground">
        The block header is the 80-byte summary miners hash when extending the chain: version,
        previous block hash, Merkle root, timestamp, difficulty target, and nonce.
      </p>
      <p className="text-xs text-muted-foreground">
        <ArticleLink slug="bitcoin-block-headers">Bitcoin block headers</ArticleLink>
        {' — '}
        full article on each field and how the block hash is formed.
      </p>
      <p className="text-xs text-muted-foreground">
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        {' — '}
        why the Merkle root commits to all transactions in the block.
      </p>
    </div>
  )
}

/** Infomode body for the Merkle root row only (links to the Merkle article). */
export function LabBlockMerkleRootInfomodeContent() {
  return (
    <div
      className={cn(
        'space-y-2 pr-1 text-sm leading-relaxed',
        '[&_.text-primary]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline',
      )}
    >
      <p className="text-popover-foreground">
        The Merkle root is a single hash that commits to every transaction in this block: change any
        transaction and the root changes.
      </p>
      <p className="text-xs text-muted-foreground">
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">
          Hashes and Merkle trees in Bitcoin
        </ArticleLink>
        {' — '}
        Merkle trees and roots in Bitcoin.
      </p>
    </div>
  )
}

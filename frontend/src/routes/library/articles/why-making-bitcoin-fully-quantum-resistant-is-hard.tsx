import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-making-bitcoin-fully-quantum-resistant-is-hard',
  title: 'Why making Bitcoin fully quantum resistant is hard',
  tagIds: ['quantum-computing', 'bitcoin', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Post-quantum cryptography</strong> refers to schemes believed to resist both classical
        and known quantum attacks. Moving Bitcoin to use them everywhere is not just a
        library swap: it is a <strong>network-wide protocol change</strong> that must preserve
        security, compatibility, and incentives for everyone involved.
      </p>
      <p>
        Most post-quantum <strong>signature</strong> schemes have much larger public keys and
        signatures than ECDSA and Schnorr. That increases transaction size and fees, reduces effective
        throughput, and complicates hardware wallets and constrained environments. Choosing parameters
        and algorithms requires consensus among implementers and users.
      </p>
      <p>
        Bitcoin also has a long history of on-chain outputs: old{' '}
        <ArticleLink slug="what-is-a-utxo">UTXO</ArticleLink>s use today&apos;s
        elliptic-curve signatures. Migrating or &quot;burning&quot; legacy coins without keys, or
        forcing everyone to move funds in a deadline, raises social and economic questions. A gradual
        transition via new output types and voluntary movement is more plausible, but it is slow and
        incomplete by definition.
      </p>
      <p>
        Changes require coordination through{' '}
        <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft forks or hard forks</ArticleLink>
        , testing, and adoption. Proof-of-work hashing is less directly threatened by Shor&apos;s
        algorithm than signatures, but the whole system must be reasoned about together. For
        background on the threat model, see{' '}
        <ArticleLink slug="quantum-computers-and-bitcoin">
          The threat of quantum computers for Bitcoin
        </ArticleLink>
        ; for signatures today, see{' '}
        <ArticleLink slug="cryptographic-signatures">Cryptographic signatures</ArticleLink>.
      </p>
    </div>
  ),
}

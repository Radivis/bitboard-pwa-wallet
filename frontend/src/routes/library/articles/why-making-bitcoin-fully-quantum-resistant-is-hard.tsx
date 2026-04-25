import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'why-making-bitcoin-fully-quantum-resistant-is-hard',
  title: 'Why making Bitcoin fully quantum resistant is hard',
  tagIds: ['quantum-computing', 'bitcoin', 'cryptography'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Switching Bitcoin to quantum-resistant cryptography is not just a software update—it is a
          network-wide migration affecting transaction sizes, fees, hardware wallets, and billions
          of dollars in existing coins that use current signatures.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          <strong>Post-quantum cryptography</strong> refers to schemes believed to resist both
          classical and quantum attacks. Moving Bitcoin to use them everywhere requires a{' '}
          <strong>network-wide protocol change</strong> that must preserve security, compatibility,
          and incentives.
        </p>
        <p>
          Most post-quantum signature schemes have much larger public keys and signatures than ECDSA
          and Schnorr. That increases transaction size and fees, reduces throughput, and complicates
          hardware wallets. Choosing algorithms requires consensus among implementers and users.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Bitcoin has years of on-chain history: old{' '}
          <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink> use today&apos;s elliptic-curve
          signatures. Migrating legacy coins or forcing movement by a deadline raises social and
          economic questions. A gradual transition via new output types is more plausible but slow.
        </p>
        <p>
          Changes require coordination through{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">
            soft forks or hard forks
          </ArticleLink>
          . Proof-of-work hashing is less directly threatened by Shor&apos;s algorithm than
          signatures. For the threat model, see{' '}
          <ArticleLink slug="quantum-computers-and-bitcoin">
            The threat of quantum computers for Bitcoin
          </ArticleLink>
          ; for signatures today, see{' '}
          <ArticleLink slug="cryptographic-signatures">Cryptographic signatures</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

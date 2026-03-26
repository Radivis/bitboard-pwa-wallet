import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin',
  title: 'Bitcoin',
  tagIds: ['bitcoin', 'cryptocurrencies'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        <strong>Bitcoin</strong> (the network and the asset) is a decentralized digital currency:
        participants agree on who owns which amounts without relying on a central bank or company to
        maintain the ledger. Why agreement on a shared history is difficult without a central referee is
        covered in{' '}
        <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
          Why consensus in decentralized networks is a hard problem
        </ArticleLink>
        . Instead, thousands of <strong>full nodes</strong> run open-source
        software that validates every transaction against the same rules: signatures must verify,
        coins cannot be spent twice, and new coins are created only according to the subsidy
        schedule.
      </p>
      <p>
        Agreement on a single ordering of transactions is achieved through{' '}
        <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work mining</ArticleLink>: miners
        compete to append new <strong>blocks</strong> to a public chain. Each block references the
        previous one via{' '}
        <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">cryptographic hashes</ArticleLink>,
        forming the <strong>blockchain</strong>—an append-only history anyone can audit. For how
        peer connections work, see{' '}
        <ArticleLink slug="what-is-a-peer-to-peer-network">What is a peer to peer network?</ArticleLink>
        .
      </p>
      <p>
        A bitcoin wallet does not store coins in a folder; it holds <strong>cryptographic keys</strong>{' '}
        that let you spend coins recorded on the network. See{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> for how that works in
        practice, and{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">Secret and public keys in Bitcoin</ArticleLink>{' '}
        for the underlying math.
      </p>
      <p>
        <strong>Segregated Witness (SegWit)</strong>, activated in 2017, changed how transaction data is
        structured and helped scale on-chain capacity; read <ArticleLink slug="segwit">SegWit</ArticleLink>{' '}
        for a short overview and why it matters for fees and security. Rule changes on Bitcoin&apos;s
        base layer are usually done as{' '}
        <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft forks</ArticleLink>.
      </p>
    </div>
  ),
}

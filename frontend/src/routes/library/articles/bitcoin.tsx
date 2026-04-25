import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'bitcoin',
  title: 'Bitcoin',
  tagIds: ['bitcoin', 'cryptocurrencies'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          Bitcoin is digital money that works without banks or governments. Imagine a public ledger
          that everyone can read and verify, but no single person controls—your balance is recorded
          there, and only you (with your private key) can authorize spending it.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          Thousands of <strong>full nodes</strong> run open-source software that validates every
          transaction against the same rules: signatures must verify, coins cannot be spent twice,
          and new coins are created only according to a fixed schedule. Why agreement on a shared
          history is difficult without a central referee is covered in{' '}
          <ArticleLink slug="why-consensus-in-decentralized-networks-is-a-hard-problem">
            Why consensus in decentralized networks is a hard problem
          </ArticleLink>
          .
        </p>
        <p>
          Agreement on transaction ordering is achieved through{' '}
          <ArticleLink slug="proof-of-work-and-mining-basics">proof-of-work mining</ArticleLink>:
          miners compete to append new <strong>blocks</strong> to a public chain. Each block
          references the previous one via{' '}
          <ArticleLink slug="hashes-and-merkle-trees-in-bitcoin">cryptographic hashes</ArticleLink>,
          forming the <strong>blockchain</strong>—an append-only history anyone can audit.
        </p>
        <p>
          A bitcoin wallet does not store coins in a folder; it holds{' '}
          <strong>cryptographic keys</strong> that let you spend coins recorded on the network. See{' '}
          <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> and{' '}
          <ArticleLink slug="secret-and-public-keys-in-bitcoin">
            Secret and public keys in Bitcoin
          </ArticleLink>
          .
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          The ledger tracks value as <ArticleLink slug="what-is-a-utxo">UTXOs</ArticleLink> (unspent
          transaction outputs)—not as bank-style account rows. Wallets scan outputs you can spend and
          build new transactions that consume them. For a concrete image of outputs, addresses, and
          keys together, see{' '}
          <ArticleLink slug="transaction-outputs-as-hidden-safes">
            Transaction outputs as hidden safes
          </ArticleLink>
          .
        </p>
        <p>
          Many blocks are mined that never become part of the canonical chain; see{' '}
          <ArticleLink slug="block-network-vs-blockchain">
            The difference between a block network and a blockchain
          </ArticleLink>{' '}
          and{' '}
          <ArticleLink slug="what-is-a-blockchain-reorganization">
            What is a blockchain reorganization?
          </ArticleLink>
          . For how peer connections work, see{' '}
          <ArticleLink slug="what-is-a-peer-to-peer-network">What is a peer to peer network?</ArticleLink>
          .
        </p>
        <p>
          <strong>Segregated Witness (SegWit)</strong>, activated in 2017, changed how transaction
          data is structured and helped scale on-chain capacity; read{' '}
          <ArticleLink slug="segwit">SegWit</ArticleLink> for details. Rule changes on Bitcoin&apos;s
          base layer are usually done as{' '}
          <ArticleLink slug="soft-forks-hard-forks-and-backward-compatibility">soft forks</ArticleLink>
          . If the stack of ideas feels heavy, see{' '}
          <ArticleLink slug="why-is-bitcoin-so-complicated">Why is Bitcoin so complicated?</ArticleLink>
          .
        </p>
      </ArticleSection>
    </div>
  ),
}

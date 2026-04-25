import { ArticleLink, ArticleSection, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'not-your-keys-not-your-coins-explained',
  title: '"Not your keys, not your coins" explained',
  tagIds: ['security', 'wallets', 'bitcoin', 'privacy'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <ArticleSection title="In a Nutshell">
        <p>
          If someone else holds your private keys, they control your bitcoin—regardless of what your
          account screen says. This phrase reminds you that in Bitcoin, possession of keys equals
          ownership, not a login or a legal agreement.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Works">
        <p>
          On the Bitcoin network, ownership is enforced by whoever can produce valid signatures with
          the right private keys. If someone else holds those keys—an exchange, a lender, or any
          custodian—they can move the funds subject to their policies, outages, or legal demands.
        </p>
        <p>
          A <strong>custodial</strong> service holds keys on your behalf (like a bank). You may have
          a login and a legal relationship, but cryptographically the coins are spendable by their
          keys. A <strong>non-custodial</strong> wallet gives you the seed or keys; you are
          responsible for backups, but no third party must cooperate for you to spend. See{' '}
          <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
        </p>
      </ArticleSection>

      <ArticleSection title="How it Really Works">
        <p>
          Custody is not always &quot;bad&quot;—some choose it for convenience, regulation, or
          operational reasons—but it is a different risk model. With self-custody, you face risks
          like losing your backup or malware. With custodial services, you face counterparty risks:
          insolvency, hacks, account freezes, or exit scams.
        </p>
        <p>
          The slogan urges you to notice which model you are in before treating an app balance like
          cash in your pocket. For the same custody split applied to cash and banks, see{' '}
          <ArticleLink slug="security-models-for-cryptocurrencies-and-conventional-currencies">
            Security models for cryptocurrencies and conventional currencies
          </ArticleLink>
          . For protecting seeds and devices, see{' '}
          <ArticleLink slug="basics-for-keeping-keys-safe">
            Basics for keeping your keys safe
          </ArticleLink>{' '}
          and <ArticleLink slug="what-is-a-hardware-wallet">What is a hardware wallet?</ArticleLink>.
        </p>
      </ArticleSection>
    </div>
  ),
}

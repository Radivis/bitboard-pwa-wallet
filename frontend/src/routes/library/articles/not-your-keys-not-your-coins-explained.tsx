import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'not-your-keys-not-your-coins-explained',
  title: '"Not your keys, not your coins" explained',
  tagIds: ['security', 'wallets', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        The phrase <strong>not your keys, not your coins</strong> is a reminder about control in
        Bitcoin. On the network, ownership is enforced by whoever can produce valid signatures with
        the right private keys. If someone else holds those keys—an exchange, a lender, or any
        custodian—they can move the funds subject to their policies, outages, or legal demands, even
        if your account screen shows a balance.
      </p>
      <p>
        A <strong>custodial</strong> service holds keys on your behalf (similar to a bank account).
        You may have a login and a legal relationship, but cryptographically the coins are spendable
        by their keys, not yours. A <strong>non-custodial</strong> wallet gives you the seed or keys;
        you are responsible for backups, but no third party must cooperate for you to spend. See{' '}
        <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink>.
      </p>
      <p>
        Custody is not always &quot;bad&quot;—some people choose it for convenience, regulation, or
        operational reasons—but it is a different risk model than self-custody. The slogan urges you
        to notice which model you are in before treating an app balance like cash in your pocket. For
        the same custody split spelled out for cash and banks, see{' '}
        <ArticleLink slug="security-models-for-cryptocurrencies-and-conventional-currencies">
          Security models for cryptocurrencies and conventional currencies
        </ArticleLink>
        .
      </p>
      <p>
        For protecting seeds and devices, see{' '}
        <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping your keys safe</ArticleLink>
        and <ArticleLink slug="what-is-a-hardware-wallet">What is a hardware wallet?</ArticleLink>.
      </p>
    </div>
  ),
}

import { ArticleLink, ARTICLE_BODY_CLASS } from '@/lib/library/article-shared'
import type { LibraryArticle } from '@/lib/library/library-article'

export const article: LibraryArticle = {
  slug: 'security-models-for-cryptocurrencies-and-conventional-currencies',
  title: 'Security models for cryptocurrencies and conventional currencies',
  tagIds: ['security', 'cryptocurrencies', 'wallets', 'bitcoin'],
  body: (
    <div className={ARTICLE_BODY_CLASS}>
      <p>
        Cryptocurrencies are purely digital, but the <strong>security model</strong> you choose rhymes
        with how people already handle money. The main split is whether <strong>you</strong> hold the
        asset (non-custodial) or <strong>someone else</strong> holds it for you (custodial). Pair
        that with either conventional currency (cash and bank money) or cryptocurrency, and you get
        four common patterns.
      </p>
      <p>
        <strong>Non-custodial, conventional.</strong> Physical <strong>cash</strong>: you keep notes and
        coins hidden at home, in a safe, or on your person in a wallet. If you lose them or they are
        stolen, they are gone; there is no central &quot;reset password.&quot; That is the everyday
        analogue of physical possession.
      </p>
      <p>
        <strong>Non-custodial, cryptocurrency.</strong> You hold{' '}
        <ArticleLink slug="secret-and-public-keys-in-bitcoin">keys</ArticleLink> yourself—typically via
        a <ArticleLink slug="what-is-a-wallet">wallet app</ArticleLink>, a{' '}
        <ArticleLink slug="what-is-a-hardware-wallet">hardware wallet</ArticleLink>, and backups such
        as a seed phrase stored securely offline. Like cash, if you lose the secrets or someone steals
        them, funds can be gone; no bank can restore your cryptographic authorization. The security
        mindset is <strong>much like hiding and guarding cash</strong>, except the &quot;bills&quot; are
        keys and backups rather than paper.
      </p>
      <p>
        <strong>Custodial, conventional.</strong> You rely on a <strong>bank</strong> (or similar
        institution) to store balances, process payments, and make funds available under rules and
        regulations. You trust their operations, security, and solvency—not possession of physical cash
        in your drawer.
      </p>
      <p>
        <strong>Custodial, cryptocurrency.</strong> An <strong>exchange, custodian, or app</strong>{' '}
        holds keys on your behalf. You trust them to keep assets safe and available, subject to their
        interfaces, policies, and jurisdiction—see{' '}
        <ArticleLink slug="not-your-keys-not-your-coins-explained">
          &quot;Not your keys, not your coins&quot; explained
        </ArticleLink>
        . The parallel is the same as banking: convenience and reliance on an institution rather than
        self-custody.
      </p>
      <p>
        In essence, cryptocurrency does not invent a wholly new social pattern: it maps to{' '}
        <strong>cash-like self-custody</strong> versus <strong>institutional custody</strong>, whether
        the rails are paper or a blockchain. For day-to-day habits with seeds and devices, see{' '}
        <ArticleLink slug="basics-for-keeping-keys-safe">Basics for keeping your keys safe</ArticleLink>
        .
      </p>
    </div>
  ),
}

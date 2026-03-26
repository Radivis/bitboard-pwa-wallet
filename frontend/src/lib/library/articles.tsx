/* eslint-disable react-refresh/only-export-components -- registry: article metadata, bodies, and helpers */
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { LibraryTagId } from './tags'

export const ARTICLE_SLUGS = ['bitcoin', 'what-is-a-wallet', 'segwit'] as const

export type ArticleSlug = (typeof ARTICLE_SLUGS)[number]

export function isArticleSlug(value: string): value is ArticleSlug {
  return (ARTICLE_SLUGS as readonly string[]).includes(value)
}

export interface LibraryArticle {
  slug: ArticleSlug
  title: string
  tagIds: LibraryTagId[]
  body: ReactNode
}

const linkClass = 'text-primary underline-offset-4 hover:underline'

/** Max contrast body copy; links stay `text-primary` for clear distinction. */
const ARTICLE_BODY_CLASS = 'space-y-4 text-sm leading-relaxed text-black dark:text-white'

/** Matches article heading contrast on the article route. */
export const LIBRARY_ARTICLE_TITLE_CLASS =
  'text-2xl font-bold tracking-tight text-black dark:text-white'

function ArticleLink({ slug, children }: { slug: ArticleSlug; children: ReactNode }) {
  return (
    <Link to="/library/articles/$slug" params={{ slug }} className={linkClass}>
      {children}
    </Link>
  )
}

const ARTICLES: Record<ArticleSlug, LibraryArticle> = {
  bitcoin: {
    slug: 'bitcoin',
    title: 'Bitcoin',
    tagIds: ['bitcoin', 'cryptocurrencies'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Bitcoin is a decentralized digital currency: participants agree on who owns which coins
          without relying on a central bank. Consensus is reached on a shared public ledger (the
          blockchain) through proof-of-work mining and full nodes that validate the rules.
        </p>
        <p>
          A bitcoin wallet does not store coins; it holds keys that let you spend coins recorded on
          the network. See <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> for
          how that works in practice.
        </p>
        <p>
          Segregated Witness (SegWit), activated in 2017, changed how transaction data is structured
          and helped scale on-chain capacity; read{' '}
          <ArticleLink slug="segwit">SegWit</ArticleLink> for a short overview and why it matters
          for fees and security.
        </p>
      </div>
    ),
  },
  'what-is-a-wallet': {
    slug: 'what-is-a-wallet',
    title: 'What is a wallet',
    tagIds: ['wallets'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          In Bitcoin, a wallet is software (and sometimes hardware) that manages cryptographic keys
          and helps you receive and spend bitcoin. The blockchain records balances; your wallet
          proves you can move funds associated with your addresses.
        </p>
        <p>
          Wallets can be custodial (a service holds keys for you) or non-custodial (only you control
          the keys). This app is built around non-custodial use: backup and protect your seed or
          descriptor material accordingly.
        </p>
        <p>
          To understand what those balances represent on the network, see the{' '}
          <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> article. For how transaction weight and
          fees relate to modern addresses, see <ArticleLink slug="segwit">SegWit</ArticleLink>.
        </p>
      </div>
    ),
  },
  segwit: {
    slug: 'segwit',
    title: 'SegWit',
    tagIds: ['bitcoin', 'soft-forks', 'history'],
    body: (
      <div className={ARTICLE_BODY_CLASS}>
        <p>
          Segregated Witness (SegWit) was a consensus change deployed as a soft fork: it redefined
          how parts of a transaction are hashed for signing (witness data is separated) and how
          block weight is counted, improving scalability and fixing quadratic hashing issues in some
          constructions.
        </p>
        <p>
          For users, SegWit enables more efficient use of block space (lower fees for the same
          economic activity in many cases) and paved the way for layered protocols. It is part of
          Bitcoin&apos;s on-chain history alongside other upgrades.
        </p>
        <p>
          SegWit sits in the broader story of <ArticleLink slug="bitcoin">Bitcoin</ArticleLink> as
          a network. If you are new to keys and addresses, read{' '}
          <ArticleLink slug="what-is-a-wallet">What is a wallet</ArticleLink> next.
        </p>
      </div>
    ),
  },
}

export function getArticle(slug: string): LibraryArticle | undefined {
  if (!isArticleSlug(slug)) return undefined
  return ARTICLES[slug]
}

export function listArticles(): LibraryArticle[] {
  return ARTICLE_SLUGS.map((slug) => ARTICLES[slug])
}

/** If `accessPath` is `/library/articles/<slug>`, returns article title for display. */
export function resolveHistoryPathLabel(accessPath: string): string | null {
  const slug = articleSlugFromAccessPath(accessPath)
  if (!slug) return null
  const article = getArticle(slug)
  return article?.title ?? null
}

export function articleSlugFromAccessPath(accessPath: string): string | null {
  const prefix = '/library/articles/'
  if (!accessPath.startsWith(prefix)) return null
  const slug = accessPath.slice(prefix.length)
  return slug.length > 0 ? slug : null
}

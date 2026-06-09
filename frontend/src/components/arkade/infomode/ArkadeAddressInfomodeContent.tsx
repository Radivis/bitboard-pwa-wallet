import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeAddressInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Arkade address</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        This is your Arkade receive address (ark1 on mainnet, tark1 on signet). Senders use it for
        instant offchain Arkade payments—not for on-chain bc1 sends.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Generate a new address when you want a fresh receive index. Your balance still includes
        payments to earlier addresses after the operator syncs.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        See{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
        {' '}for how Arkade addresses differ from bc1 and boarding addresses.
      </ArkadeInfomodeParagraph>
    </div>
  )
}

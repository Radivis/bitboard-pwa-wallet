import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeAddressInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Arkade address</InfomodeHeading>
      <InfomodeParagraph>
        This is your Arkade receive address (ark1 on mainnet, tark1 on signet). Senders use it for
        instant offchain Arkade payments—not for on-chain bc1 sends.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Generate a new address when you want a fresh receive index. Your balance still includes
        payments to earlier addresses after the operator syncs.
      </InfomodeParagraph>
      <InfomodeParagraph>
        See{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
        {' '}for how Arkade addresses differ from bc1 and boarding addresses.
      </InfomodeParagraph>
    </div>
  )
}

import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  INFOMODE_CONTENT_CLASS,
  InfomodeHeading,
  InfomodeParagraph,
} from '@/components/infomode/InfomodeContentShared'

export function ArkadeFeatureInfomodeContent() {
  return (
    <div className={INFOMODE_CONTENT_CLASS}>
      <InfomodeHeading>Arkade (offchain layer)</InfomodeHeading>
      <InfomodeParagraph>
        Arkade provides instant offchain payments using virtual balance units (VTXOs) without a
        Lightning wallet. Bitboard derives Arkade from your same seed phrase but uses separate
        ark1/tark1 addresses.
      </InfomodeParagraph>
      <InfomodeParagraph>
        VTXO renewal can run via Fulmine delegators (one per network) while the app
        is closed. Available on mainnet and signet—not lab or regtest.
      </InfomodeParagraph>
      <InfomodeParagraph>
        Learn more:{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
        {' '}and{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink>.
      </InfomodeParagraph>
    </div>
  )
}

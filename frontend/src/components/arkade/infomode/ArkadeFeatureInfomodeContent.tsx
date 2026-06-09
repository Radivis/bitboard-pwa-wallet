import { ArticleLink } from '@/lib/library/article-shared'
import { ARKADE_LIBRARY_SLUGS } from '@/lib/arkade/arkade-infomode'
import {
  ARKADE_INFOMODE_CONTENT_CLASS,
  ArkadeInfomodeHeading,
  ArkadeInfomodeParagraph,
} from '@/components/arkade/infomode/arkade-infomode-content-shared'

export function ArkadeFeatureInfomodeContent() {
  return (
    <div className={ARKADE_INFOMODE_CONTENT_CLASS}>
      <ArkadeInfomodeHeading>Arkade (offchain layer)</ArkadeInfomodeHeading>
      <ArkadeInfomodeParagraph>
        Arkade provides instant offchain payments using virtual balance units (VTXOs) without a
        Lightning wallet. Bitboard derives Arkade from your same seed phrase but uses separate
        ark1/tark1 addresses.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        VTXO renewal can run via Fulmine delegators (one per network) while the app
        is closed. Available on mainnet and signet—not lab or regtest.
      </ArkadeInfomodeParagraph>
      <ArkadeInfomodeParagraph>
        Learn more:{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.overview}>Arkade in Bitboard Wallet</ArticleLink>
        {' '}and{' '}
        <ArticleLink slug={ARKADE_LIBRARY_SLUGS.vtxo}>What is a VTXO?</ArticleLink>.
      </ArkadeInfomodeParagraph>
    </div>
  )
}

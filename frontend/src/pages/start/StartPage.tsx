import { BookOpen, FlaskConical, Settings, Signpost, Wallet } from 'lucide-react'
import { AppHero } from '@/components/AppHero'
import { DesignCardButton } from '@/components/design/DesignCardButton'
import { PostLockPrivacyBanner } from '@/components/PostLockPrivacyBanner'
import { useWallets } from '@/db'

export function StartPage() {
  const { data: wallets } = useWallets()
  const walletDestination = wallets != null && wallets.length === 0 ? '/setup' : '/wallet'

  return (
    <div className="flex flex-col items-center gap-8">
      <PostLockPrivacyBanner />
      <AppHero />
      <nav aria-label="App areas" className="flex w-full flex-col gap-6">
        <DesignCardButton to={walletDestination} icon={Wallet}>
          Wallet
        </DesignCardButton>
        <DesignCardButton to="/lab/blocks" icon={FlaskConical}>
          Lab
        </DesignCardButton>
        <DesignCardButton to="/library" icon={BookOpen}>
          Library
        </DesignCardButton>
        <DesignCardButton to="/guides" icon={Signpost}>
          Guides
        </DesignCardButton>
        <DesignCardButton to="/settings" icon={Settings}>
          Settings
        </DesignCardButton>
      </nav>
    </div>
  )
}

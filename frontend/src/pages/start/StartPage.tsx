import { BookOpen, FlaskConical, Settings, Signpost, Wallet } from 'lucide-react'
import { AppHero } from '@/components/AppHero'
import { DesignCardButton } from '@/components/design/DesignCardButton'
import { designButtonGroupClassName } from '@/components/design/design-classes'
import { PostLockPrivacyBanner } from '@/components/PostLockPrivacyBanner'
import { cn } from '@/lib/shared/utils'
import { useWallets } from '@/db'

export function StartPage() {
  const { data: wallets } = useWallets()
  const walletDestination = wallets != null && wallets.length === 0 ? '/setup' : '/wallet'

  return (
    <div className="flex flex-col items-center gap-8">
      <PostLockPrivacyBanner />
      <AppHero />
      <nav aria-label="App areas" className={cn(designButtonGroupClassName, 'gap-6')}>
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

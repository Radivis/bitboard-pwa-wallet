import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Download, Settings } from 'lucide-react'
import { AppDescription } from '@/components/AppDescription'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardDescription,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'

export const Route = createFileRoute('/setup/')({
  component: SetupWelcome,
})

function SetupWelcome() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-3 text-3xl font-bold tracking-tight">
          <img
            src="/bitboard-icon.png"
            alt=""
            className="h-10 w-10 shrink-0"
            width={40}
            height={40}
          />
          Bitboard Wallet
        </h1>
        <AppDescription className="mt-2" />
      </div>

      <InfomodeWrapper
        infoId="setup-create-wallet-card"
        infoTitle="Create a brand-new wallet"
        infoText="Pick this if you have never used this app before. Bitboard will create a secret list of words called a recovery phrase (sometimes called a seed phrase). Those words are the backup for your money—there is no bank to reset your password. You will write them down and keep them safe. After that, you choose a password to lock the wallet on this device."
        className="rounded-xl"
      >
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Create New Wallet</DesignCardTitle>
            <DesignCardDescription>
              Generate a new seed phrase and set up a fresh wallet. Best for
              first-time users.
            </DesignCardDescription>
          </DesignCardHeader>
          <DesignCardContent>
            <Link to="/setup/create" className="block">
              <DesignButton className="w-full" icon={<Plus />}>
                Create New Wallet
              </DesignButton>
            </Link>
          </DesignCardContent>
        </DesignCard>
      </InfomodeWrapper>

      <InfomodeWrapper
        infoId="setup-import-wallet-card"
        infoTitle="Bring back a wallet you already have"
        infoText="Choose this if you used another Bitcoin wallet before and still have your recovery phrase (your list of backup words). Typing those words here loads the same wallet into Bitboard—your balance and addresses come back with you. Never share these words with anyone; they control your funds."
        className="rounded-xl"
      >
        <DesignCard>
          <DesignCardHeader>
            <DesignCardTitle>Import Existing Wallet</DesignCardTitle>
            <DesignCardDescription>
              Restore a wallet from an existing seed phrase. Use this if you
              already have a backup.
            </DesignCardDescription>
          </DesignCardHeader>
          <DesignCardContent>
            <Link to="/setup/import" className="block">
              <DesignButton appearance="secondary" className="w-full" icon={<Download />}>
                Import Wallet
              </DesignButton>
            </Link>
          </DesignCardContent>
        </DesignCard>
      </InfomodeWrapper>

      <div className="flex justify-center">
        <Link to="/settings">
          <DesignButton appearance="tertiary" icon={<Settings />}>
            Settings
          </DesignButton>
        </Link>
      </div>
    </div>
  )
}

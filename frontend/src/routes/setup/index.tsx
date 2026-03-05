import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/setup/')({
  component: SetupWelcome,
})

function SetupWelcome() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-3 text-3xl font-bold tracking-tight">
          <img
            src="/bitboard-icon.svg"
            alt=""
            className="h-10 w-10 shrink-0"
            width={40}
            height={40}
          />
          Bitboard Wallet
        </h1>
        <p className="mt-2 text-muted-foreground">
          A self-custody Bitcoin wallet in your browser.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Wallet
          </CardTitle>
          <CardDescription>
            Generate a new seed phrase and set up a fresh wallet. Best for
            first-time users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/setup/create">
            <Button className="w-full" size="lg">
              Create New Wallet
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Import Existing Wallet
          </CardTitle>
          <CardDescription>
            Restore a wallet from an existing seed phrase. Use this if you
            already have a backup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/setup/import">
            <Button className="w-full" variant="outline" size="lg">
              Import Wallet
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

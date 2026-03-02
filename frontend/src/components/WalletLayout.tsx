import { type ReactNode } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'

interface WalletLayoutProps {
  children: ReactNode
}

function WalletThemeToggle() {
  const { mode, toggleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
    >
      {mode === 'dark' ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  )
}

export function WalletLayout({ children }: WalletLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4">
          <h1 className="text-lg font-semibold tracking-tight">
            Bitboard Wallet
          </h1>
          <WalletThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl px-4 py-6">
        {children}
      </main>
    </div>
  )
}

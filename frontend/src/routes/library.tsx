import { createFileRoute } from '@tanstack/react-router'
import { BookOpen } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/library')({
  component: LibraryPage,
})

export function LibraryPage() {
  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <BookOpen className="h-8 w-8" aria-hidden />
        Library
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>In-app knowledge base</CardTitle>
          <CardDescription>Coming soon</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            This section will host guides and reference material inside Bitboard Wallet.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

import { Card, CardContent } from '@/components/ui/card'

interface MnemonicGridProps {
  words: string[]
  columns?: number
}

export function MnemonicGrid({ words, columns = 3 }: MnemonicGridProps) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {words.map((word, index) => (
        <Card key={index} className="py-2">
          <CardContent className="flex items-center gap-2 px-3 py-0">
            <span className="min-w-6 text-xs font-medium text-muted-foreground">
              {index + 1}.
            </span>
            <span className="font-mono text-sm">{word}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

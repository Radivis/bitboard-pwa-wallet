import { Zap } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function Layer2Page() {
  return (
    <>
      <PageHeader title="Layer 2" icon={Zap} />
      <Card>
        <CardHeader>
          <CardTitle>Lightning</CardTitle>
          <CardDescription>Lab layer two</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Lightning in the lab is under construction.
          </p>
        </CardContent>
      </Card>
    </>
  )
}

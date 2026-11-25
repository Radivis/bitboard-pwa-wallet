import { CircleCheck, CircleDollarSign, CircleX, Info, TriangleAlert } from 'lucide-react'

const statusIcon = {
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  risk: CircleDollarSign,
} as const

export type DesignStatus = keyof typeof statusIcon

export function DesignStatusIcon({ status }: { status: DesignStatus }) {
  const Icon = statusIcon[status]
  return <Icon className="size-6 shrink-0" aria-hidden />
}

import { useEffect, useState } from 'react'
import { APP_PASSWORD_MIN_LENGTH } from '@/lib/app-password-policy'

interface PasswordStrengthIndicatorProps {
  password: string
}

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
const STRENGTH_COLORS = [
  'bg-red-500',
  'bg-orange-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
]

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  const [result, setResult] = useState<{ score: number } | null>(null)

  useEffect(() => {
    if (!password) {
      setResult(null)
      return
    }
    let cancelled = false
    void import('zxcvbn').then((mod) => {
      if (cancelled) return
      setResult(mod.default(password))
    })
    return () => {
      cancelled = true
    }
  }, [password])

  if (!result) return null

  const { score } = result
  const filledSegments = score + 1

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < filledSegments ? STRENGTH_COLORS[score] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: {STRENGTH_LABELS[score]}
        {password.length < APP_PASSWORD_MIN_LENGTH && (
          <span className="ml-1">
            (at least {APP_PASSWORD_MIN_LENGTH} characters required)
          </span>
        )}
      </p>
    </div>
  )
}

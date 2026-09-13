import { format, formatDistanceToNow } from 'date-fns'
import type { ArkadeOperatorScheduledSession } from '@/workers/arkade-api'

export function advanceStaleOperatorScheduledSession(
  session: ArkadeOperatorScheduledSession,
  nowUnixSecs: number,
): ArkadeOperatorScheduledSession {
  if (session.period <= 0) {
    return session
  }

  let nextStartTime = session.nextStartTime
  let nextEndTime = session.nextEndTime
  while (nextEndTime <= nowUnixSecs) {
    nextStartTime += session.period
    nextEndTime += session.period
  }

  const inProgress =
    nowUnixSecs >= nextStartTime && nowUnixSecs < nextEndTime

  return {
    ...session,
    nextStartTime,
    nextEndTime,
    inProgress,
  }
}

export function formatSchedulePeriodLabel(periodSecs: number): string | null {
  if (periodSecs <= 0) {
    return null
  }
  if (periodSecs < 60) {
    return `every ${periodSecs}s`
  }
  if (periodSecs < 3_600) {
    const minutes = Math.round(periodSecs / 60)
    return `every ${minutes} min`
  }
  if (periodSecs < 86_400) {
    const hours = Math.round(periodSecs / 3_600)
    return `every ${hours} h`
  }
  const days = Math.round(periodSecs / 86_400)
  return `every ${days} d`
}

export function formatArkadeOperatorBatchWindow(
  session: ArkadeOperatorScheduledSession,
  nowUnixSecs: number = Math.floor(Date.now() / 1000),
): { primary: string; periodSuffix: string | null } {
  const normalized = advanceStaleOperatorScheduledSession(session, nowUnixSecs)
  const startDate = new Date(normalized.nextStartTime * 1000)
  const endDate = new Date(normalized.nextEndTime * 1000)
  const absoluteStart = format(startDate, 'yyyy-MM-dd HH:mm')

  const periodSuffix = formatSchedulePeriodLabel(normalized.period)

  if (normalized.inProgress) {
    return {
      primary: `Operator batch round in progress · ends ${formatDistanceToNow(endDate, { addSuffix: true })} (${format(endDate, 'yyyy-MM-dd HH:mm')})`,
      periodSuffix: periodSuffix != null ? `Repeats ${periodSuffix}` : null,
    }
  }

  return {
    primary: `Next operator batch round starts ${formatDistanceToNow(startDate, { addSuffix: true })} (${absoluteStart})`,
    periodSuffix: periodSuffix != null ? `Repeats ${periodSuffix}` : null,
  }
}

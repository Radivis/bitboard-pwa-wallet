export const SECONDS_PER_MINUTE = 60
export const SECONDS_PER_HOUR = 3_600
export const SECONDS_PER_DAY = 86_400

export function durationUnit(count: number, singular: string): string {
  const label = count === 1 ? singular : `${singular}s`
  return `${count} ${label}`
}

/** Remaining or elapsed time, dropping leading zero units: `2 days 3 hours 4 minutes 5 seconds`. */
export function formatDurationDaysHoursMinutesSeconds(totalSeconds: number): string {
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return durationUnit(totalSeconds, 'second')
  }

  const seconds = totalSeconds % SECONDS_PER_MINUTE
  if (totalSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
    return `${durationUnit(minutes, 'minute')} ${durationUnit(seconds, 'second')}`
  }

  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  if (totalSeconds < SECONDS_PER_DAY) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
    return `${durationUnit(hours, 'hour')} ${durationUnit(minutes, 'minute')} ${durationUnit(seconds, 'second')}`
  }

  const days = Math.floor(totalSeconds / SECONDS_PER_DAY)
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR)
  return `${durationUnit(days, 'day')} ${durationUnit(hours, 'hour')} ${durationUnit(minutes, 'minute')} ${durationUnit(seconds, 'second')}`
}

/**
 * One rounded unit for a static delay: minutes under an hour, hours under a day, otherwise days.
 * A 172544-second CSV is "2 days" here and a full countdown string in
 * {@link formatDurationDaysHoursMinutesSeconds}.
 */
export function formatCoarseDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.max(1, Math.round(totalSeconds / SECONDS_PER_MINUTE))
    return durationUnit(minutes, 'minute')
  }
  if (totalSeconds < SECONDS_PER_DAY) {
    const hours = Math.max(1, Math.round(totalSeconds / SECONDS_PER_HOUR))
    return durationUnit(hours, 'hour')
  }
  const days = Math.max(1, Math.round(totalSeconds / SECONDS_PER_DAY))
  return durationUnit(days, 'day')
}

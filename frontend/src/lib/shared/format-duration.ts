const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3_600
const SECONDS_PER_DAY = 86_400

function durationUnit(count: number, singular: string): string {
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

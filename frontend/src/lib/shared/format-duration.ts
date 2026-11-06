const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3_600
const SECONDS_PER_DAY = 86_400

/** Compact remaining or elapsed time: `2d 3h 4m 5s`, dropping leading zero units. */
export function formatDurationDaysHoursMinutesSeconds(totalSeconds: number): string {
  if (totalSeconds < SECONDS_PER_MINUTE) {
    return `${totalSeconds} seconds`
  }

  const seconds = totalSeconds % SECONDS_PER_MINUTE
  if (totalSeconds < SECONDS_PER_HOUR) {
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
    return `${minutes} minutes ${seconds}seconds`
  }

  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
  if (totalSeconds < SECONDS_PER_DAY) {
    const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
    return `${hours} hours ${minutes} minutes ${seconds} seconds`
  }

  const days = Math.floor(totalSeconds / SECONDS_PER_DAY)
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR)
  return `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`
}

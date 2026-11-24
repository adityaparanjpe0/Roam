const calendarFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
})

/** API-validated calendar dates are not instants in the viewer's time zone. */
export function formatTripDate(value: string): string {
  return calendarFormatter.format(new Date(`${value}T00:00:00Z`))
}

/** Inclusive calendar days; UTC arithmetic avoids daylight-saving transitions. */
export function tripDurationDays(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1
}

export function formatTravelerCount(count: number): string {
  return `${new Intl.NumberFormat('en-US').format(count)} ${count === 1 ? 'traveler' : 'travelers'}`
}

/** Known minor units per person for the entire trip; null never means zero. */
export function formatTripBudget(minor: number | null, currency: string): string {
  if (minor === null) return 'Not specified'
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' })
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
  return formatter.format(minor / (10 ** digits))
}

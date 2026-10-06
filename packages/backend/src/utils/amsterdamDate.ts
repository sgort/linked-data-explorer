// Calendar helpers for /v2/norms, whose default `valid_on` is "today" as a
// Dutch consumer means it: the date in Europe/Amsterdam, not in UTC.

const TIME_ZONE = 'Europe/Amsterdam';
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? '';
}

/** The calendar date in Amsterdam at `now`, as YYYY-MM-DD. */
export function todayInAmsterdam(now: Date = new Date()): string {
  const parts = dateParts.formatToParts(now);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}

/**
 * Seconds from `now` until the next midnight in Amsterdam, by wall-clock time.
 *
 * On the two days a year the clock changes, the true figure differs by an
 * hour before 02:00/03:00. Callers only use this as a cap below 3600 seconds,
 * which can bite in the last hour before midnight, long after the change: the
 * result is exact wherever it matters.
 */
export function secondsUntilAmsterdamMidnight(now: Date = new Date()): number {
  const parts = timeParts.formatToParts(now);
  const elapsed =
    Number(part(parts, 'hour')) * 3600 +
    Number(part(parts, 'minute')) * 60 +
    Number(part(parts, 'second'));
  return 86400 - elapsed;
}

/** True for a YYYY-MM-DD string naming a real date (no 2026-02-30). */
export function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Small IANA timezone helpers on top of Intl, so weeks and days follow the user's clock. */

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, tz: string) {
  let fmt = formatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour!, min: +p.minute!, s: +p.second! };
}

/** Milliseconds the zone is ahead of UTC at this instant. */
function offsetMs(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of 00:00 local time on the given local date (day may overflow). */
export function zonedMidnight(y: number, m: number, d: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(new Date(guess), tz);
  // Re-check at the result, in case a DST change sits between the guess and midnight.
  return new Date(guess - offsetMs(new Date(first), tz));
}

/** Local calendar day, e.g. "2026-10-23". */
export function dayKey(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Start of the local day `daysAgo` days before `date`. */
export function startOfDay(date: Date, tz: string, daysAgo = 0) {
  const p = partsIn(date, tz);
  return zonedMidnight(p.y, p.m, p.d - daysAgo, tz);
}

/** Monday 00:00 local time of the week `weeksAgo` weeks before the one containing `date`. */
export function startOfWeek(date: Date, tz: string, weeksAgo = 0) {
  const p = partsIn(date, tz);
  const weekday = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  const sinceMonday = (weekday + 6) % 7;
  return zonedMidnight(p.y, p.m, p.d - sinceMonday - weeksAgo * 7, tz);
}

/** The Monday after `weekStart` (handles 23 h / 25 h DST days). */
export function nextWeek(weekStart: Date, tz: string) {
  const p = partsIn(weekStart, tz);
  return zonedMidnight(p.y, p.m, p.d + 7, tz);
}

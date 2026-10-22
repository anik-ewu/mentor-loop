const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const longDayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

export const formatDay = (iso: string | Date) => dayFmt.format(new Date(iso));
export const formatLongDay = (iso: string | Date) => longDayFmt.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeFmt.format(new Date(iso));
export const formatRange = (start: string, end: string) =>
  `${formatTime(start)} – ${formatTime(end)}`;

/** Local YYYY-MM-DD key, used to group slots by calendar day. */
export function dayKey(iso: string | Date) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function groupByDay<T>(items: T[], getDate: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(getDate(item));
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export const isPast = (iso: string) => new Date(iso).getTime() < Date.now();

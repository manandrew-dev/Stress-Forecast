// Date helpers that work on plain "YYYY-MM-DD" strings in UTC so no timezone shifts sneak in.

export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the user's own timezone (not UTC), as "YYYY-MM-DD". */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86_400_000);
}

export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `day`. */
export function weekStartOf(day: string): string {
  const dow = parseDay(day).getUTCDay(); // 0 = Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(day, offset);
}

const short = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const long = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function shortDate(day: string): string {
  return short.format(parseDay(day));
}

export function longDate(day: string): string {
  return long.format(parseDay(day));
}

export function rangeLabel(start: string, end: string): string {
  return start === end ? longDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

/** "Today", "Tomorrow", "In 5 days", "Yesterday", "12 days ago". */
export function relativeDay(due: string, today: string): string {
  const d = diffDays(due, today);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

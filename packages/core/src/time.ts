/** UTC instant of local midnight for `now` in `timeZone`. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const { year, month, day } = localParts(now, timeZone);
  return fromLocal(year, month, day, now, timeZone);
}

/** UTC instant of local midnight on the 1st of the month for `now` in `timeZone`. */
export function startOfLocalMonth(now: Date, timeZone: string): Date {
  const { year, month } = localParts(now, timeZone);
  return fromLocal(year, month, 1, now, timeZone);
}

/** UTC instant of the next local midnight after `now` in `timeZone` ("until the end of the day"). */
export function startOfNextLocalDay(now: Date, timeZone: string): Date {
  // 36 h past local midnight always lands inside the next local day, DST or not.
  return startOfLocalDay(addHours(startOfLocalDay(now, timeZone), 36), timeZone);
}

/** The local calendar date as "YYYY-MM-DD" (for per-day counters and grouping). */
export function localDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

/** The local hour of the day, 0–23. */
export function localHour(date: Date, timeZone: string): number {
  return localParts(date, timeZone).hour;
}

// Making a formatter is slow and reports read the time of every sale, so one per time zone is kept.
const formatters = new Map<string, Intl.DateTimeFormat>();

function localParts(date: Date, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function fromLocal(year: number, month: number, day: number, reference: Date, timeZone: string): Date {
  return new Date(Date.UTC(year, month - 1, day) - offsetMs(reference, timeZone));
}

import { productTimeZone } from "@lanbort/contracts";

const dayFormat = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const timeFormat = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: productTimeZone,
});

/** A calendar date (`YYYY-MM-DD`) as people say it: «lørdag 5. oktober». */
export function formatDay(date: string): string {
  // A calendar date has no time zone; formatting it as UTC keeps the day.
  return dayFormat.format(new Date(`${date}T00:00:00Z`));
}

/** A moment in the product's time zone: «fredag 10. oktober kl. 14:00». */
export function formatTime(at: string): string {
  return timeFormat.format(new Date(at));
}

/** A loan period, both days inclusive. */
export function formatPeriod(period: { start: string; end: string }): string {
  return period.start === period.end
    ? formatDay(period.start)
    : `${formatDay(period.start)} – ${formatDay(period.end)}`;
}

const calendarFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: productTimeZone,
});

/** The calendar date (`YYYY-MM-DD`) in Norway at `at`, such as today's. */
export function calendarDay(at: Date = new Date()): string {
  return calendarFormat.format(at);
}

/** The calendar date `days` after `date`. */
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);

  return day.toISOString().slice(0, 10);
}

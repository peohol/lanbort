import { productTimeZone } from "@lanbort/contracts";

const dayFormat = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const shortDayFormat = new Intl.DateTimeFormat("nb-NO", {
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

/**
 * A period in few words, for a button that names an agreement (UX-INT-003):
 * «10.–12. oktober», «30. september–2. oktober».
 */
export function formatShortPeriod(period: {
  start: string;
  end: string;
}): string {
  const day = (date: string) => new Date(`${date}T00:00:00Z`);
  const [start, end] = [day(period.start), day(period.end)];

  if (period.start === period.end) return shortDayFormat.format(start);

  return start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
    ? `${start.getUTCDate()}.–${shortDayFormat.format(end)}`
    : `${shortDayFormat.format(start)}–${shortDayFormat.format(end)}`;
}

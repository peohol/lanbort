import { productTimeZone } from "@lanbort/contracts";
import { calendarDay } from "@/presentation/dates";

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("nb-NO", { timeZone: productTimeZone, ...options });

const clock = format({ hour: "2-digit", minute: "2-digit" });
const weekday = format({ weekday: "short" });
const shortDate = format({ day: "numeric", month: "short" });
const longDay = format({ weekday: "long", day: "numeric", month: "long" });

/** How many calendar days in Norway lie between two moments. */
const daysBetween = (from: Date, to: Date) =>
  Math.round(
    (Date.parse(calendarDay(to)) - Date.parse(calendarDay(from))) / 86_400_000,
  );

/** A message's time: just the clock. */
export const messageTime = (iso: string) => clock.format(new Date(iso));

/** The heading over a day's messages: «I dag», «I går», «fredag 9. oktober». */
export function dayHeading(iso: string, now = new Date()): string {
  const days = daysBetween(new Date(iso), now);
  if (days === 0) return "I dag";
  if (days === 1) return "I går";
  const day = longDay.format(new Date(iso));
  return day.charAt(0).toLocaleUpperCase("nb-NO") + day.slice(1);
}

/** Whether two moments fall on the same day in Norway. */
export const sameDay = (a: string, b: string) =>
  calendarDay(new Date(a)) === calendarDay(new Date(b));

/** A conversation's last activity in the list: «19:20», «fre.», «2. okt.». */
export function listTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const days = daysBetween(at, now);
  if (days === 0) return clock.format(at);
  if (days > 0 && days < 7) return weekday.format(at);
  return shortDate.format(at);
}

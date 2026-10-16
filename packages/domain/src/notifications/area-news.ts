import {
  type AreaNews,
  type NewsArea,
  newsAreaKinds,
  newsAreas,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

type Db = Kysely<Database>;

/** An area never opened has seen nothing: everything unread is news. */
const neverSeen = "0";

/**
 * UX-IA-022: how many things are new in each area since the user last
 * opened its page. A thing is what a notification is about, so several
 * notifications about one loan count once, from its request to its
 * reviews. A notification the user has read is no longer news anywhere.
 */
export async function loadAreaNews(db: Db, userId: string): Promise<AreaNews> {
  const visits = await db
    .selectFrom("app.area_visits")
    .select(["area", "seen_through"])
    .where("user_id", "=", userId)
    .execute();
  const seen = new Map(visits.map((visit) => [visit.area, visit.seen_through]));
  const seenThrough = (area: NewsArea) => seen.get(area) ?? neverSeen;
  const position = (area: NewsArea) => sql`${seenThrough(area)}::bigint`;

  const { rows } = await sql<Record<NewsArea, number>>`
    select ${sql.join(
      newsAreas.map(
        (area) => sql`count(distinct news.subject) filter (
          where news.kind = any(${[...newsAreaKinds[area]]}::text[])
            and news.position > ${position(area)}
        )::int as ${sql.ref(area)}`,
      ),
    )}
    from (
      select notification.kind, notification.position,
             coalesce(loan.request_id, notification.target_id) as subject
        from app.notifications notification
        left join app.loans loan
          on notification.target_type in ('loan', 'loan_reviews')
         and loan.id = notification.target_id
        left join app.cases "case"
          on notification.target_type = 'case'
         and "case".id = notification.target_id
       where notification.recipient_id = ${userId}
         -- Home shows the queues of environments; the platform's is elsewhere.
         and (notification.target_type <> 'case' or "case".environment_id is not null)
         and notification.read_at is null
         and notification.position > least(${sql.join(newsAreas.map(position))})
    ) news
  `.execute(db);

  return Object.fromEntries(
    newsAreas.map((area) => [area, rows[0]?.[area] ?? 0]),
  ) as AreaNews;
}

/**
 * The user opened `area`'s own page: everything up to their newest
 * notification is seen there. A visit never moves backwards.
 */
export async function recordAreaVisit(
  db: Db,
  userId: string,
  area: NewsArea,
  now: Date,
): Promise<void> {
  await db
    .insertInto("app.area_visits")
    .values({
      user_id: userId,
      area,
      seen_through: sql`coalesce((
        select max(position) from app.notifications
        where recipient_id = ${userId}
      ), 0)`,
      visited_at: now,
    })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "area"]).doUpdateSet({
        seen_through: sql`greatest(app.area_visits.seen_through, excluded.seen_through)`,
        visited_at: now,
      }),
    )
    .execute();
}

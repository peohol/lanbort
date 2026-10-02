import type { ObjectRevisionChange } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";

/** What a command records about the version it creates. */
export interface RevisionNote {
  readonly actorUserId: string;
  readonly change: Exclude<ObjectRevisionChange, "baseline">;
  /** For a revert: the version whose content it brought back. */
  readonly revertedToVersion?: number;
}

/**
 * Stores the object's content at its current version, with who made the
 * change and when (PS-OBJ-013). Runs after every child row of the change is
 * written; the database refuses to commit a version without its revision.
 */
export async function recordRevision(
  db: Kysely<Database>,
  objectId: string,
  note: RevisionNote,
  now: Date,
): Promise<void> {
  await sql`
    insert into app.object_revisions (
      object_id, version, change, reverted_to_version, actor_user_id,
      recorded_at, title, category_id, description, loan_terms, status,
      availability, image_ids
    )
    select
      object.id, object.version, ${note.change}, ${note.revertedToVersion ?? null},
      ${note.actorUserId}, ${now}, object.title, object.category_id,
      object.description, object.loan_terms, object.status,
      coalesce((
        select jsonb_agg(
          jsonb_build_object('from', lower(period)::text, 'until', upper(period)::text)
          order by lower(period)
        )
        from app.object_availability_intervals
        where object_id = object.id
      ), '[]'::jsonb),
      array(
        select id from app.object_images
        where object_id = object.id
        order by position
      )
    from app.objects as object
    where object.id = ${objectId}
  `.execute(db);
}

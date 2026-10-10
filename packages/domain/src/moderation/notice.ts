import type { MeasureNotice, MeasureNoticeKind } from "@lanbort/contracts";
import { measureNoticeQuerySchema } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineQuery } from "../commands/query";
import { inSnapshot } from "../objects/state";
import { readMeasureNoticePolicy } from "./policies";
import { findReportedReview } from "./store";

type Db = Kysely<Database>;

/**
 * Whom a measure's notice goes to (PS-TRUST-018): the owners of the thing
 * whose publication or loans it stops, the author of the review or response
 * it takes out, or the member whose membership it ends (PS-ENV-021).
 * Lifting a block goes to the owners it held back (product owner,
 * 10 October 2026).
 */
const hits: Record<
  MeasureNoticeKind,
  "owners" | "review_author" | "response_author" | "member" | null
> = {
  publication_rejected: "owners",
  publication_blocked: "owners",
  object_blocked: "owners",
  object_unblocked: "owners",
  review_removed: "review_author",
  review_text_removed: "review_author",
  review_score_removed: "review_author",
  review_response_removed: "response_author",
  membership_ended: "member",
};

/**
 * The measure as its notice tells it, with whom it hits now; null when it
 * does not exist. Nothing of its case is read.
 */
async function loadNotice(db: Db, measureId: string) {
  const row = await db
    .selectFrom("app.moderation_actions as measure")
    .leftJoin("app.objects as object", "object.id", "measure.object_id")
    .leftJoin(
      "app.environment_memberships as membership",
      "membership.id",
      "measure.membership_id",
    )
    .leftJoin(
      "app.environments as environment",
      "environment.id",
      "membership.environment_id",
    )
    .select([
      "measure.id",
      "measure.kind",
      "measure.scope",
      "measure.environment_id",
      "measure.object_id",
      "measure.review_id",
      "measure.dimension",
      "measure.reason",
      "measure.decided_at",
      "object.title as object_title",
      "membership.user_id as member_user_id",
      "environment.name as environment_name",
    ])
    .where("measure.id", "=", measureId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const kind = row.kind as MeasureNoticeKind;
  const review =
    row.review_id === null ? null : await findReportedReview(db, row.review_id);
  const owners =
    hits[kind] === "owners" && row.object_id !== null
      ? (
          await db
            .selectFrom("app.object_owners")
            .select("user_id")
            .where("object_id", "=", row.object_id)
            .execute()
        ).map(({ user_id }) => user_id)
      : [];
  const affected = {
    owners,
    review_author: review ? [review.authorUserId] : [],
    response_author: review?.response ? [review.response.authorUserId] : [],
    member: row.member_user_id ? [row.member_user_id] : [],
  };

  return {
    affected: hits[kind] === null ? [] : affected[hits[kind]],
    notice: {
      id: row.id,
      kind,
      scope: row.scope as MeasureNotice["scope"],
      environmentId: row.environment_id,
      environmentName: row.environment_name,
      objectId: row.object_id,
      objectTitle: row.object_title,
      loanId: review?.loanId ?? null,
      dimension: row.dimension as MeasureNotice["dimension"],
      reason: row.reason,
      decidedAt: row.decided_at.toISOString(),
    } satisfies MeasureNotice,
  };
}

/** Whom the measure hits now: those its notice goes to. */
export async function measureAffected(
  db: Db,
  measureId: string,
): Promise<readonly string[]> {
  return (await loadNotice(db, measureId))?.affected ?? [];
}

/**
 * PS-TRUST-018: what a measure did, where and why, for whoever it hits, with
 * the way to ask for a new assessment left to the page: the environment's
 * administrators for a local measure, Lånbort for a platform one.
 */
export const readMeasureNotice = defineQuery({
  name: "moderation.read_notice",
  input: measureNoticeQuerySchema,
  policy: readMeasureNoticePolicy,
  load: ({ db, input }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadNotice(tx, input.measureId);

      return loaded && { resource: loaded, context: undefined };
    }),
  present: ({ resource }): MeasureNotice => resource.notice,
});

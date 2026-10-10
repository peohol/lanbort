import type { MeasureNotice, ModerationMeasureKind } from "@lanbort/contracts";
import { measureNoticeQuerySchema } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { defineQuery } from "../commands/query";
import { inSnapshot } from "../objects/state";
import { readMeasureNoticePolicy } from "./policies";
import { findReportedReview } from "./store";

type Db = Kysely<Database>;

/**
 * Whom a measure hits (PS-TRUST-018): the owners of the thing whose
 * publication or loans it stops, or the author of the review or response it
 * takes out. Lifting a block hits nobody.
 */
const hits: Record<
  ModerationMeasureKind,
  "owners" | "review_author" | "response_author" | null
> = {
  publication_rejected: "owners",
  publication_blocked: "owners",
  object_blocked: "owners",
  object_unblocked: null,
  review_removed: "review_author",
  review_text_removed: "review_author",
  review_score_removed: "review_author",
  review_response_removed: "response_author",
};

/**
 * The measure as its notice tells it, with whom it hits now; null when it
 * does not exist. Nothing of its case is read.
 */
async function loadNotice(db: Db, measureId: string) {
  const row = await db
    .selectFrom("app.moderation_actions as measure")
    .leftJoin("app.objects as object", "object.id", "measure.object_id")
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
    ])
    .where("measure.id", "=", measureId)
    .executeTakeFirst();

  if (!row) {
    return null;
  }

  const kind = row.kind as ModerationMeasureKind;
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
  };

  return {
    affected: hits[kind] === null ? [] : affected[hits[kind]],
    notice: {
      id: row.id,
      kind,
      scope: row.scope as MeasureNotice["scope"],
      environmentId: row.environment_id,
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

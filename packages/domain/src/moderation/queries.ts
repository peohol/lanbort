import { type CaseMeasures, caseMeasuresQuerySchema } from "@lanbort/contracts";
import { loadCase } from "../cases/commands";
import { defineQuery } from "../commands/query";
import { inSnapshot } from "../objects/state";
import { listCaseMeasuresPolicy } from "./policies";
import { loadMeasures } from "./store";

/**
 * The measures taken on a report, oldest first, with their reasons and what
 * they removed: internal moderation history for its handlers only
 * (PS-TRUST-014/016). Its reporter sees whether the report is handled, and
 * what a handler writes to them, in the case itself.
 */
export const listCaseMeasures = defineQuery({
  name: "moderation.list_measures",
  input: caseMeasuresQuerySchema,
  policy: listCaseMeasuresPolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadCase(tx, actor, input.caseId, now);

      if (!loaded) {
        return null;
      }

      // Nothing more is read for callers the policy will turn away.
      const { standing } = loaded.resource;
      const measures =
        standing.holdsRole && !standing.involved
          ? await loadMeasures(tx, input.caseId)
          : [];

      return {
        resource: { ...loaded.resource, measures },
        context: undefined,
      };
    }),
  present: ({ input, resource }): CaseMeasures => ({
    caseId: input.caseId,
    items: resource.measures,
  }),
});

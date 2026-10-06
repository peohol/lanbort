import { type HomeOverview } from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import { caseQueueHomeSource } from "../cases/home";
import { AuthorizationError } from "../errors";
import { environmentHomeSource } from "../environment/home";
import { listOwnEnvironments } from "../environment/queries";
import {
  coOwnerLoanHomeSource,
  loanHomeSource,
  loanRequestHomeSource,
} from "../loans/home";
import { coOwnerInvitationHomeSource } from "../objects/home";
import { reviewHomeSource } from "../reviews/home";
import { socialHomeSource } from "../social/home";
import { arrangeHome } from "./model";
import { readHomePolicy } from "./policies";
import { type HomeSource, homeReader } from "./source";

/** Everything that can ask something of the user on Home. */
export const homeSources: readonly HomeSource[] = [
  loanRequestHomeSource,
  loanHomeSource,
  coOwnerLoanHomeSource,
  reviewHomeSource,
  socialHomeSource,
  coOwnerInvitationHomeSource,
  environmentHomeSource,
  caseQueueHomeSource,
];

/**
 * Home (UX-IA-005): first what waits for the caller, unsettled loans, the
 * next handover and return days and their administrative tasks; then
 * shortcuts to their own environments. Every part comes from the query of
 * the context it leads to, as the caller and as of the same moment, so Home
 * never shows more than that context does. A part the caller may not read
 * (an account that keeps only what its loans need) is simply empty.
 */
export const readHome = defineQuery({
  name: "home.read",
  input: z.strictObject({}),
  policy: readHomePolicy,
  load: async ({ db, actor, now }) => {
    const reader = homeReader({ db, clock: () => now }, actor);
    const [items, environments] = await Promise.all([
      Promise.all(
        homeSources.map(async (source) => {
          try {
            return await source.items(reader);
          } catch (error) {
            if (error instanceof AuthorizationError) {
              return [];
            }

            throw error;
          }
        }),
      ),
      reader.ifAllowed(listOwnEnvironments, {}),
    ]);

    return {
      resource: {
        sections: arrangeHome(items.flat()),
        environments: (environments ?? []).filter(
          (environment) =>
            environment.membershipState === "active" ||
            environment.membershipState === "passive",
        ),
      },
      context: undefined,
    };
  },
  present: ({ resource }): HomeOverview => resource,
});

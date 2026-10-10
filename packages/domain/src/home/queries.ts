import {
  type HomeItem,
  type HomeOverview,
  homeItemKinds,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import { caseQueueHomeSource, environmentCaseQueueItems } from "../cases/home";
import { AuthorizationError } from "../errors";
import {
  environmentAdministrationItems,
  environmentHomeItems,
  environmentHomeSource,
  ownObjectIdsOnce,
} from "../environment/home";
import { getEnvironment, listOwnEnvironments } from "../environment/queries";
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

/**
 * Home's «Som administrator» for one environment (UX-JRN-012, Tomat
 * kjerneflyt 3): the same counted tasks, read the same way, but only this
 * environment's, for its own page. To anyone who does not administer it,
 * or may not see it, there are none, the same answer as for an id that
 * names nothing (PS-NFR-002).
 */
export const listEnvironmentAdministrationTasks = defineQuery({
  name: "environment.list_administration_tasks",
  input: z.strictObject({ environmentId: z.uuid() }),
  policy: readHomePolicy,
  load: async ({ db, actor, input, now }) => {
    const reader = homeReader({ db, clock: () => now }, actor);
    const environment = await reader.ifAllowed(getEnvironment, input);
    const items: HomeItem[] = [];

    if (environment?.roles.includes("administrator")) {
      const cases = await environmentCaseQueueItems(reader, environment);

      items.push(
        ...environmentHomeItems(environment),
        ...(await environmentAdministrationItems(
          reader,
          environment,
          ownObjectIdsOnce(reader),
        )),
        ...cases,
      );
    }

    return {
      resource: items.filter(
        ({ kind }) => homeItemKinds[kind] === "administration",
      ),
      context: undefined,
    };
  },
  present: ({ resource }): HomeItem[] => resource,
});

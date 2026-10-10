import type {
  CaseKind,
  CaseSummary,
  EnvironmentSummary,
  HomeItem,
  HomeItemKind,
} from "@lanbort/contracts";
import { collectPages } from "../commands/pages";
import { listOwnEnvironments } from "../environment/queries";
import { type HomeReader, type HomeSource, homeItem } from "../home/source";
import { actingUserId } from "../objects/state";
import { listEnvironmentCaseQueue } from "./queries";

/**
 * The Home task for each kind of case an environment's administrators
 * handle: answering contacts, mediating loans and assessing reports
 * (UX-JRN-012, Tomat kjerneflyt 8).
 */
const caseTasks = {
  environment_contact: "environment.handle_cases",
  loan_mediation: "environment.mediate_loans",
  environment_report: "environment.review_reports",
} as const satisfies Partial<Record<CaseKind, HomeItemKind>>;

/**
 * UX-JRN-012: the open cases in an environment's queue that wait for the
 * caller as its administrator, one task per kind: nobody has taken them,
 * or the caller has. The queue already leaves out what they are involved
 * in (PS-USR-009).
 */
export function caseQueueHomeItems(
  environment: Pick<EnvironmentSummary, "id" | "name">,
  queue: readonly CaseSummary[],
  userId: string,
): HomeItem[] {
  const waiting = queue.filter(
    (c) =>
      c.status === "open" &&
      (c.assigneeUserId === null || c.assigneeUserId === userId),
  );

  return Object.entries(caseTasks).flatMap(([kind, task]) => {
    const count = waiting.filter((c) => c.kind === kind).length;

    return count > 0
      ? [
          homeItem(
            task,
            { type: "environment", id: environment.id },
            { title: environment.name, count },
          ),
        ]
      : [];
  });
}

/** The open cases waiting in one environment's queue for the caller. */
export async function environmentCaseQueueItems(
  { actor, ifAllowed }: HomeReader,
  environment: Pick<EnvironmentSummary, "id" | "name">,
): Promise<HomeItem[]> {
  const { items: queue } = await collectPages(
    (cursor) =>
      ifAllowed(listEnvironmentCaseQueue, {
        environmentId: environment.id,
        status: "open",
        cursor,
      }),
    (page) => page.items,
  );

  return caseQueueHomeItems(environment, queue, actingUserId(actor));
}

/** The case queues of the environments the caller administers. */
export const caseQueueHomeSource: HomeSource = {
  name: "case_queues",
  async items(reader) {
    const items: HomeItem[] = [];

    for (const environment of await reader.query(listOwnEnvironments, {})) {
      if (!environment.roles.includes("administrator")) continue;

      items.push(...(await environmentCaseQueueItems(reader, environment)));
    }

    return items;
  },
};

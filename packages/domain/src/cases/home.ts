import type {
  CaseSummary,
  EnvironmentSummary,
  HomeItem,
} from "@lanbort/contracts";
import { collectPages } from "../commands/pages";
import { listOwnEnvironments } from "../environment/queries";
import { type HomeReader, type HomeSource, homeItem } from "../home/source";
import { actingUserId } from "../objects/state";
import { listEnvironmentCaseQueue } from "./queries";

/**
 * UX-JRN-012: the open cases in an environment's queue that wait for the
 * caller as its administrator: nobody has taken them, or the caller has.
 * The queue already leaves out what they are involved in (PS-USR-009).
 */
export function caseQueueHomeItem(
  environment: Pick<EnvironmentSummary, "id" | "name">,
  queue: readonly CaseSummary[],
  userId: string,
): HomeItem | null {
  const count = queue.filter(
    (c) =>
      c.status === "open" &&
      (c.assigneeUserId === null || c.assigneeUserId === userId),
  ).length;

  return count > 0
    ? homeItem(
        "environment.handle_cases",
        { type: "environment", id: environment.id },
        { title: environment.name, count },
      )
    : null;
}

/** The open cases waiting in one environment's queue for the caller. */
export async function environmentCaseQueueItem(
  { actor, ifAllowed }: HomeReader,
  environment: Pick<EnvironmentSummary, "id" | "name">,
): Promise<HomeItem | null> {
  const { items: queue } = await collectPages(
    (cursor) =>
      ifAllowed(listEnvironmentCaseQueue, {
        environmentId: environment.id,
        status: "open",
        cursor,
      }),
    (page) => page.items,
  );

  return caseQueueHomeItem(environment, queue, actingUserId(actor));
}

/** The case queues of the environments the caller administers. */
export const caseQueueHomeSource: HomeSource = {
  name: "case_queues",
  async items(reader) {
    const items: HomeItem[] = [];

    for (const environment of await reader.query(listOwnEnvironments, {})) {
      if (!environment.roles.includes("administrator")) continue;

      const item = await environmentCaseQueueItem(reader, environment);

      if (item) items.push(item);
    }

    return items;
  },
};

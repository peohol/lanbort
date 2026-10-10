import type { CaseList } from "@lanbort/contracts";
import type { Actor } from "../actor";
import { listPlatformCaseQueue } from "../cases/queries";
import type { DomainContext } from "../commands/command";
import { executeQuery } from "../commands/query";

/**
 * The ids of every case in the platform queue `actor` handles, page by page.
 * Test files share one database and leave their reports open, so a new case
 * can lie beyond the first page.
 */
export async function platformQueueIds(
  domain: Pick<DomainContext, "db" | "clock">,
  actor: Actor,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;

  do {
    const page: CaseList = await executeQuery(domain, listPlatformCaseQueue, {
      actor,
      input: cursor === null ? {} : { cursor },
    });
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor !== null);

  return ids;
}

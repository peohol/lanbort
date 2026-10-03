import type { AccountBinding } from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import type { Kysely } from "kysely";
import { environmentOwnershipBindings } from "../environment/account-bindings";
import { loanBindings } from "../loans/account-lifecycle";

/**
 * Where PS-ADM-004's bindings come from: what must be finished or handed
 * over before an account can be deleted. Later work packages add their
 * source here (for example cases from WP-45) instead of a parallel check,
 * so deletion sees every binding. A source that fails makes the command
 * fail: nothing is deleted on an unknown answer.
 */
export interface AccountBindingSource {
  readonly name: string;
  load(db: Kysely<Database>, userId: string): Promise<AccountBinding[]>;
}

export const accountBindingSources: readonly AccountBindingSource[] = [
  loanBindings,
  environmentOwnershipBindings,
];

/** Every binding of the account, from every source. */
export async function loadBindings(
  db: Kysely<Database>,
  userId: string,
  sources: readonly AccountBindingSource[],
): Promise<AccountBinding[]> {
  const loaded = [];

  // One transaction serves every source, so they run one after another.
  for (const source of sources) {
    loaded.push(...(await source.load(db, userId)));
  }

  return loaded;
}

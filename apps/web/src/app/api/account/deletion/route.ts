import {
  deleteOwnAccount,
  executeCommand,
  getAccountDeletionCheck,
} from "@lanbort/domain";
import { commandResponse } from "@/server/http/body";
import { userQueryRoute } from "@/server/http/command-route";
import { route } from "@/server/http/route";

/** What still binds the account and must be finished first (PS-ADM-004). */
export const GET = userQueryRoute(getAccountDeletionCheck);

/**
 * PS-ADM-004–006: deletes the user's own account, after a fresh
 * confirmation of their identity, and signs them out.
 */
export const POST = route.user(async ({ requestId, actor, domain, auth }) => {
  const result = await executeCommand(domain, deleteOwnAccount, {
    actor,
    input: {},
    correlationId: requestId,
  });
  await auth.signOut();

  return commandResponse(result);
});

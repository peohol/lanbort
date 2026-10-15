import {
  executeCommand,
  expireFriendInvitations,
  friendInvitationExpiryProcess,
} from "@lanbort/domain";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/**
 * Ends invitations by e-mail address that have expired, with the friend
 * requests they became that still wait, and deletes expired friend codes
 * (PS-USR-013, PS-USR-014). Called by the scheduler with the cron secret;
 * safe to call repeatedly and concurrently.
 */
export const GET = route.scheduler(
  friendInvitationExpiryProcess,
  async ({ actor, domain, requestId }) =>
    Response.json(
      (
        await executeCommand(domain, expireFriendInvitations, {
          actor,
          input: {},
          correlationId: requestId,
        })
      ).output,
    ),
);

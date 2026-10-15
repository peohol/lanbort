import { listFriendInvitations, sendFriendInvitation } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The signed-in user's open invitations by e-mail address (PS-USR-013). */
export const GET = userQueryRoute(listFriendInvitations);

/**
 * Invites `{ email, befriend }` (PS-USR-013, PS-USR-015). The answer is the
 * same whether the address has an account or not.
 */
export const POST = userCommandRoute(sendFriendInvitation);

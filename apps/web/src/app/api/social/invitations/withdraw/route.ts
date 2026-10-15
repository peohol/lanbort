import { withdrawFriendInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Takes back one of the user's invitations, `{ invitationId }`. */
export const POST = userCommandRoute(withdrawFriendInvitation);

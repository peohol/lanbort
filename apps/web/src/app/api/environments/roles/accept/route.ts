import { acceptRoleInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The invited member accepts the role invitation `{ invitationId }`. */
export const POST = userCommandRoute(acceptRoleInvitation);

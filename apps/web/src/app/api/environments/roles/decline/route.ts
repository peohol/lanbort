import { declineRoleInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The invited member declines the role invitation `{ invitationId }`. */
export const POST = userCommandRoute(declineRoleInvitation);

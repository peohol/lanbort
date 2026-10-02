import { withdrawRoleInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Withdraws the pending role invitation `{ invitationId }`. */
export const POST = userCommandRoute(withdrawRoleInvitation);

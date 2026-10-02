import { withdrawCoOwnerInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An owner withdraws the pending invitation `{ invitationId }`. */
export const POST = userCommandRoute(withdrawCoOwnerInvitation);

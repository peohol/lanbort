import { acceptCoOwnerInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The invited user accepts `{ invitationId }` and becomes a co-owner. */
export const POST = userCommandRoute(acceptCoOwnerInvitation);

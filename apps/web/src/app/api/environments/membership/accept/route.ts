import { acceptInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Accepts the caller's own invitation (PS-ENV-010). */
export const POST = userCommandRoute(acceptInvitation);

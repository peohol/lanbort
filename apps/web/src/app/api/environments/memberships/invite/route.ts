import { inviteMember } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator invites `{ userId }` to a closed or hidden environment. */
export const POST = userCommandRoute(inviteMember);

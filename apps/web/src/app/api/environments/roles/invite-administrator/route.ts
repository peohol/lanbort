import { inviteAdministrator } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator invites the active member `{ userId }` to administer. */
export const POST = userCommandRoute(inviteAdministrator);

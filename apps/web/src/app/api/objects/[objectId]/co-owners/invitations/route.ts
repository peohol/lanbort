import { inviteCoOwner } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An owner invites `{ userId }` to become a co-owner (PS-OBJ-007). */
export const POST = userCommandRoute(inviteCoOwner);

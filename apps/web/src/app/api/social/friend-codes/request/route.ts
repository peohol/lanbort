import { requestFriendByCode } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A friend request to the person whose code `{ code }` is (PS-USR-014). */
export const POST = userCommandRoute(requestFriendByCode);

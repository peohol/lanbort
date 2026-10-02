import { sendFriendRequest } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Sends a friend request to `{ userId }` (PS-USR-003). */
export const POST = userCommandRoute(sendFriendRequest);

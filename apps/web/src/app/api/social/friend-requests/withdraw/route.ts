import { withdrawFriendRequest } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Withdraws the caller's pending request to `{ userId }`. */
export const POST = userCommandRoute(withdrawFriendRequest);

import { acceptFriendRequest } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Accepts the pending request from `{ userId }`. */
export const POST = userCommandRoute(acceptFriendRequest);

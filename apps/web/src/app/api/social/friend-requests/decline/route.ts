import { declineFriendRequest } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Declines the pending request from `{ userId }`. */
export const POST = userCommandRoute(declineFriendRequest);

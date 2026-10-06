import { listFriendObjects } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * `?userId=&cursor=`: the objects a friend has made visible to friends, for
 * their profile (PS-OBJ-020). Anyone else's shows none.
 */
export const GET = userQueryRoute(listFriendObjects);

import { blockUser } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Blocks `{ userId }` (PS-USR-006). */
export const POST = userCommandRoute(blockUser);

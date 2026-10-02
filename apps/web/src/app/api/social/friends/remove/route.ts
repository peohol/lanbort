import { removeFriend } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Ends the friendship with `{ userId }`. */
export const POST = userCommandRoute(removeFriend);

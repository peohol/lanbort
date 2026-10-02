import { liftUserBlock } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Lifts the caller's block of `{ userId }`. */
export const POST = userCommandRoute(liftUserBlock);

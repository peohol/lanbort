import { openCaseRound } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A handler opens a new writing round for `{ userId }`, or for every participant. */
export const POST = userCommandRoute(openCaseRound);

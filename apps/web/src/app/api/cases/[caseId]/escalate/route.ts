import { escalateReport } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ body }`: the handler of an environment report sends it on to the platform stewards. */
export const POST = userCommandRoute(escalateReport);

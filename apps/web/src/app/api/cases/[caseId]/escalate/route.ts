import { escalateReport } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ body }`: the handler of an environment report sends it on to the
 * platform stewards. Only while stewards can handle cases (UX-EXC-011).
 */
export const POST = stewardsOnly(userCommandRoute(escalateReport));

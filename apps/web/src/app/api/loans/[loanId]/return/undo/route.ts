import { undoReturn } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The caller takes back their waiting return confirmation (PS-LOAN-016). */
export const POST = userPathCommandRoute(undoReturn);

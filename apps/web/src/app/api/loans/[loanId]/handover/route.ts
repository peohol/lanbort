import { reportHandover } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A party says whether the object was handed over (PS-LOAN-012–013). */
export const POST = userCommandRoute(reportHandover);

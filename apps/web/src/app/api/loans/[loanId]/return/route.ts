import { reportReturn } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A party says what happened at the return (PS-LOAN-014–017, PS-LOAN-020). */
export const POST = userCommandRoute(reportReturn);

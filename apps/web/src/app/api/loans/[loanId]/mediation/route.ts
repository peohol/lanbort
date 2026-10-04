import { requestLoanMediation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A party of a loan through an environment asks its administrators to mediate: `{ body }`, their first statement. */
export const POST = userCommandRoute(requestLoanMediation);

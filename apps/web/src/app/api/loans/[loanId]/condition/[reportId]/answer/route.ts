import { answerLoanCondition } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The other party disagrees with a report or explains, once, without changing it (PS-LOAN-023). */
export const POST = userCommandRoute(answerLoanCondition);

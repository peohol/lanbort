import { readLoanConditionReports, reportLoanCondition } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The loan's reports of damage, deficiency or loss with their answers (PS-LOAN-023). */
export const GET = userQueryRoute(readLoanConditionReports);

/** A party registers damage, deficiency or loss; the loan itself is unchanged (PS-LOAN-023). */
export const POST = userCommandRoute(reportLoanCondition);

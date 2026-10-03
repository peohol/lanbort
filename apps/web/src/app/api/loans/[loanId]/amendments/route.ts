import { proposeLoanAmendment } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A party proposes a new period; nothing changes until the other accepts (PS-LOAN-010). */
export const POST = userCommandRoute(proposeLoanAmendment);

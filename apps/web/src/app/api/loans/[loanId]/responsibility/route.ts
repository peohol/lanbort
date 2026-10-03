import { offerResponsibility } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The responsible lender offers the role to a co-owner (PS-LOAN-009). */
export const POST = userCommandRoute(offerResponsibility);

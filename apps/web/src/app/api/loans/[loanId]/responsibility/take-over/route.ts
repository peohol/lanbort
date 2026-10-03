import { takeOverResponsibility } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** A co-owner takes over while the responsible lender is unavailable (PS-LOAN-009). */
export const POST = userPathCommandRoute(takeOverResponsibility);

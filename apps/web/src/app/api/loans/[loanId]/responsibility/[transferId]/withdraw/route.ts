import { withdrawResponsibilityTransfer } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** Whoever proposed the change of the responsible lender takes it back. */
export const POST = userPathCommandRoute(withdrawResponsibilityTransfer);

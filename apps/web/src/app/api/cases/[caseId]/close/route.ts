import { closeCase } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** A handler closes the case; it decides nothing about the loan or account. */
export const POST = userPathCommandRoute(closeCase);

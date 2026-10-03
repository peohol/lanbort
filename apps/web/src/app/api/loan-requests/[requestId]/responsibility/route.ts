import { acceptResponsibility } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ declarationVersion }`: a party accepts the responsibility declaration (PS-LOAN-003). */
export const POST = userCommandRoute(acceptResponsibility);

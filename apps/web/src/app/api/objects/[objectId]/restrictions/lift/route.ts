import { liftObjectRestriction } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Only the co-owner who set `{ restrictionId }` can withdraw it. */
export const POST = userCommandRoute(liftObjectRestriction);

import { reactivateAccount } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** A deactivated or dormant account is taken into use again. */
export const POST = userPathCommandRoute(reactivateAccount);

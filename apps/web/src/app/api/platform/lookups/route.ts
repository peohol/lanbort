import { lookUpPlatformSubject } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ by, email | userId | objectId }`: a steward finds an account or a
 * thing from its full e-mail address or the link to its page, recorded
 * found or not (OD-0055). Only while stewards can handle cases.
 */
export const POST = stewardsOnly(userCommandRoute(lookUpPlatformSubject));

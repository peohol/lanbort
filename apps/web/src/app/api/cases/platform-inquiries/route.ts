import { openPlatformInquiry } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ target, basis }`: a steward opens a case of their own about an account
 * or a thing and holds it at once (PS-ADM-015). Only while stewards can
 * handle cases.
 */
export const POST = stewardsOnly(userCommandRoute(openPlatformInquiry));

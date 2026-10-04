import { readTrustProfile } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * `?userId=`, optionally `&role=` and `&cursor=`: that person's trust
 * profile, for themselves or a reader with access to their profile
 * (PS-TRUST-006/007).
 */
export const GET = userQueryRoute(readTrustProfile);

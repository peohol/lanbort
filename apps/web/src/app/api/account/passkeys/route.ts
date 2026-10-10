import { listOwnPasskeys } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userQueryRoute } from "@/server/http/command-route";

/** The steward's passkeys and whether this session is confirmed (ADR-0011). */
export const GET = stewardsOnly(userQueryRoute(listOwnPasskeys));

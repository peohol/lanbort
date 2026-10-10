import { reportUnavailability } from "@lanbort/domain";
import { stewardsOnly } from "@/server/http/chat-gate";
import { userCommandRoute } from "@/server/http/command-route";

/** A confidential report that `{ userId }` may have died or be permanently unavailable: `{ userId, body }` (PS-COM-015). Off until the platform stewards can handle it (ADR-0011, OD-0023). */
export const POST = stewardsOnly(userCommandRoute(reportUnavailability));

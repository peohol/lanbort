import { reportUnavailability } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A confidential report that `{ userId }` may have died or be permanently unavailable: `{ userId, body }` (PS-COM-015). */
export const POST = userCommandRoute(reportUnavailability);

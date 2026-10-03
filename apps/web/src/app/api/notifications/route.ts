import { listNotifications } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/**
 * `?cursor=`: the caller's notification centre, newest first, with the
 * number of unread notifications for the badge (PS-COM-001–003).
 */
export const GET = userQueryRoute(listNotifications);

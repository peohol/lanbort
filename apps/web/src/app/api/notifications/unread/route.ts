import { countUnreadNotifications } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** The number of the caller's unread notifications, for the indicator. */
export const GET = userQueryRoute(countUnreadNotifications);

import {
  readNotificationPreferences,
  setNotificationPreference,
} from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** How the caller is told, per level and channel (PS-COM-003). */
export const GET = userQueryRoute(readNotificationPreferences);

/** Turns one configurable channel of one level on or off (PS-COM-002). */
export const POST = userCommandRoute(setNotificationPreference);

import { markAllNotificationsRead } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Marks the caller's notifications up to the newest one they saw as read. */
export const POST = userCommandRoute(markAllNotificationsRead);

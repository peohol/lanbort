import { markNotificationsRead } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Marks the caller's listed notifications as read. */
export const POST = userCommandRoute(markNotificationsRead);

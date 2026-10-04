import { approveChatLink } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An existing device certifies the new one and hands over its package. */
export const POST = userCommandRoute(approveChatLink);

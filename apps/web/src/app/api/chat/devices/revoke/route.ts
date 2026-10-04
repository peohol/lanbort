import { revokeChatDevice } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Shuts one of the account's devices out, by a revocation it signed. */
export const POST = userCommandRoute(revokeChatDevice);

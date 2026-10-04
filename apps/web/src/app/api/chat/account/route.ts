import { registerChatAccount } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The account's first chat device: a new account key and this device. */
export const POST = userCommandRoute(registerChatAccount);

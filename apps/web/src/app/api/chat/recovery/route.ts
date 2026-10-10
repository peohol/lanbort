import {
  createChatRecoveryKey,
  readChatRecoveryBackup,
} from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** The recovery key's backup, as ciphertext, for restoring chat with it. */
export const GET = chatOnly(userQueryRoute(readChatRecoveryBackup));

/** A new recovery key's first backup; the earlier key stops working. */
export const POST = chatOnly(userCommandRoute(createChatRecoveryKey));

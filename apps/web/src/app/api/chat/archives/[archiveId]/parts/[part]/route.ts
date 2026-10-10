import { putChatArchivePart, readChatArchivePart } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** One part of a complete archive, for a device of the same account. */
export const GET = chatOnly(userQueryRoute(readChatArchivePart));

/** One encrypted part of the archive, stored once. */
export const POST = chatOnly(userCommandRoute(putChatArchivePart));

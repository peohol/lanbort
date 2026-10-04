import { resetChatAccount } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** A new account key; every earlier device is shut out (ADR-0010 §8). */
export const POST = chatOnly(userCommandRoute(resetChatAccount));

import { resetChatAccount } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A new account key; every earlier device is shut out (ADR-0010 §8). */
export const POST = userCommandRoute(resetChatAccount);

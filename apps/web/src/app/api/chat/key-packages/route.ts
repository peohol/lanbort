import { publishChatKeyPackages } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** This device's key packages, so others can add it to conversations. */
export const POST = chatOnly(userCommandRoute(publishChatKeyPackages));

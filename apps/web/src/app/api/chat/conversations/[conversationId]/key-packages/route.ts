import { claimChatKeyPackages } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/** One key package per participant device, to add them to the group. */
export const POST = chatOnly(userPathCommandRoute(claimChatKeyPackages));

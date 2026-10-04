import { claimChatKeyPackages } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** One key package per participant device, to add them to the group. */
export const POST = userPathCommandRoute(claimChatKeyPackages);

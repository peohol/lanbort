import { publishChatKeyPackages } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** This device's key packages, so others can add it to conversations. */
export const POST = userCommandRoute(publishChatKeyPackages);

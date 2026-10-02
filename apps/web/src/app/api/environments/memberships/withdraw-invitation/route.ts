import { withdrawInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator withdraws a pending invitation. */
export const POST = userCommandRoute(withdrawInvitation);

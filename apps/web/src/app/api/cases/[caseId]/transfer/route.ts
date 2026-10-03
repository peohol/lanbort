import { transferCase } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The handler who has the case hands it to another handler `{ toUserId }`. */
export const POST = userCommandRoute(transferCase);

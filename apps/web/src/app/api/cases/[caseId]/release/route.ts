import { releaseCase } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The handler who has the case gives it back to the queue. */
export const POST = userPathCommandRoute(releaseCase);

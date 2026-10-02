import { withdrawPublication } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** `{ publicationId }`: any owner takes the object down from an environment. */
export const POST = userCommandRoute(withdrawPublication);

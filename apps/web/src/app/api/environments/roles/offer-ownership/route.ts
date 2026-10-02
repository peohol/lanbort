import { offerOwnership } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The owner offers ownership to the administrator `{ userId }`. */
export const POST = userCommandRoute(offerOwnership);

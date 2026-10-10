import { endContact } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The member who contacted the administrators closes the contact. */
export const POST = userPathCommandRoute(endContact);

import { requestInformation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator asks the applicant for more information. */
export const POST = userCommandRoute(requestInformation);

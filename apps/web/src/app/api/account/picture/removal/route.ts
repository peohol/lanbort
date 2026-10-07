import { removeProfilePicture } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** Removes the profile picture; its file is deleted after commit (outbox). */
export const POST = userPathCommandRoute(removeProfilePicture);

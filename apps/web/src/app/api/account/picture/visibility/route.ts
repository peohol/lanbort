import { setProfilePictureVisibility } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Who sees the profile picture: generally, friends or only the user. */
export const POST = userCommandRoute(setProfilePictureVisibility);

import { readProfilePicture } from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { imageFileResponse, profilePictureServices } from "@/server/images";

/**
 * A person's profile picture, streamed only to those the person lets see
 * it (PS-USR-002). A replaced picture's address names nothing.
 */
export const GET = route.user(async ({ params, actor, domain }) => {
  const services = profilePictureServices();

  if (!services) {
    return errorResponse("unavailable");
  }

  return imageFileResponse(
    await readProfilePicture(domain, services.store, {
      actor,
      input: { pictureId: params.pictureId },
    }),
  );
});

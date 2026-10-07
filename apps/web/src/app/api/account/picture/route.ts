import { profilePictureMaxUploadBytes } from "@lanbort/contracts";
import { uploadProfilePicture } from "@lanbort/domain";
import {
  commandResponse,
  idempotencyKeyOf,
  readBytes,
} from "@/server/http/body";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { profilePictureServices } from "@/server/images";

/**
 * Sets the profile picture (PS-USR-002), the cropped picture as the body.
 * The server re-encodes it without metadata before storing it privately.
 */
export const POST = route.user(
  async ({ request, requestId, actor, domain }) => {
    const services = profilePictureServices();

    if (!services) {
      return errorResponse("unavailable");
    }

    return commandResponse(
      await uploadProfilePicture(domain, services, {
        actor,
        bytes: await readBytes(request, profilePictureMaxUploadBytes, "image"),
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    );
  },
);

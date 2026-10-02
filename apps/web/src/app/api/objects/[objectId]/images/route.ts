import { objectImageMaxUploadBytes } from "@lanbort/contracts";
import { uploadObjectImage } from "@lanbort/domain";
import {
  commandResponse,
  idempotencyKeyOf,
  readBytes,
} from "@/server/http/body";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { objectImageServices } from "@/server/object-images";

/**
 * Adds an image (the raw file as the body). The server re-encodes it without
 * metadata before storing it privately.
 */
export const POST = route.user(
  async ({ request, requestId, params, actor, domain }) => {
    const services = objectImageServices();

    if (!services) {
      return errorResponse("unavailable");
    }

    return commandResponse(
      await uploadObjectImage(domain, services, {
        actor,
        objectId: params.objectId,
        bytes: await readBytes(request, objectImageMaxUploadBytes, "image"),
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    );
  },
);

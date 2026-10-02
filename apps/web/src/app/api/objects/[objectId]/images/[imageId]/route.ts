import {
  executeCommand,
  readObjectImage,
  removeObjectImage,
} from "@lanbort/domain";
import { commandResponse, idempotencyKeyOf } from "@/server/http/body";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { objectImageServices } from "@/server/object-images";

/** The image file, streamed only after the object's read policy allowed it. */
export const GET = route.user(async ({ params, actor, domain }) => {
  const services = objectImageServices();

  if (!services) {
    return errorResponse("unavailable");
  }

  const image = await readObjectImage(domain, services.store, {
    actor,
    input: { objectId: params.objectId, imageId: params.imageId },
  });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-disposition": "inline",
    },
  });
});

/** Removes the image; its file is deleted after commit (outbox). */
export const DELETE = route.user(
  async ({ request, requestId, params, actor, domain }) =>
    commandResponse(
      await executeCommand(domain, removeObjectImage, {
        actor,
        input: { objectId: params.objectId, imageId: params.imageId },
        idempotencyKey: idempotencyKeyOf(request),
        correlationId: requestId,
      }),
    ),
);

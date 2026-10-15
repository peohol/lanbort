import { objectImageMaxUploadBytes } from "@lanbort/contracts";
import { consumeActorRateLimit, rateLimits } from "@lanbort/domain";
import { readBytes } from "@/server/http/body";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { heifToJpeg, imageFileResponse } from "@/server/images";

/**
 * A HEIC photo (the raw file as the body) as a JPEG the browser can draw,
 * for a browser that cannot decode HEIC itself. Nothing is stored: the photo
 * comes back to be previewed, cropped and uploaded like any other, within
 * the same uploads budget.
 */
export const POST = route.user(async ({ request, actor, domain }) => {
  await consumeActorRateLimit(domain, rateLimits.uploads, actor);
  const jpeg = await heifToJpeg(
    await readBytes(request, objectImageMaxUploadBytes, "image"),
  );

  return jpeg
    ? imageFileResponse({ bytes: jpeg, contentType: "image/jpeg" })
    : errorResponse("invalid_input");
});

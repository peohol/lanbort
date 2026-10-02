import { readPublishedObjectImage } from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { objectImageServices } from "@/server/object-images";

/**
 * `?environmentId=&objectId=&imageId=`: an image of an object the caller
 * finds or reviews in the environment, streamed only after that policy.
 */
export const GET = route.user(async ({ request, actor, domain }) => {
  const services = objectImageServices();

  if (!services) {
    return errorResponse("unavailable");
  }

  const image = await readPublishedObjectImage(domain, services.store, {
    actor,
    input: Object.fromEntries(request.nextUrl.searchParams),
  });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-disposition": "inline",
    },
  });
});

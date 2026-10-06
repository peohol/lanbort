import { friendObjectImageFile, readImageFile } from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { objectImageServices } from "@/server/object-images";

/**
 * `?objectId=&imageId=`: an image of an object the caller finds through a
 * friend, streamed only after that policy.
 */
export const GET = route.user(async ({ request, actor, domain }) => {
  const services = objectImageServices();

  if (!services) {
    return errorResponse("unavailable");
  }

  const image = await readImageFile(
    domain,
    services.store,
    friendObjectImageFile,
    { actor, input: Object.fromEntries(request.nextUrl.searchParams) },
  );

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "content-disposition": "inline",
    },
  });
});

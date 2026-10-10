import { loanRequestImageFile, readImageFile } from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { imageFileResponse, objectImageServices } from "@/server/images";

/** A picture of the request's thing, streamed only after its policy. */
export const GET = route.user(async ({ params, actor, domain }) => {
  const services = objectImageServices();

  if (!services) {
    return errorResponse("unavailable");
  }

  const image = await readImageFile(
    domain,
    services.store,
    loanRequestImageFile,
    {
      actor,
      input: { requestId: params.requestId, imageId: params.imageId },
    },
  );

  return imageFileResponse(image);
});

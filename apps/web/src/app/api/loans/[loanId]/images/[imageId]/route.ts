import { loanImageFile, readImageFile } from "@lanbort/domain";
import { errorResponse } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { imageFileResponse, objectImageServices } from "@/server/images";

/** A picture of the loan's thing, streamed only after its parties' policy. */
export const GET = route.user(async ({ params, actor, domain }) => {
  const services = objectImageServices();

  if (!services) {
    return errorResponse("unavailable");
  }

  const image = await readImageFile(domain, services.store, loanImageFile, {
    actor,
    input: { loanId: params.loanId, imageId: params.imageId },
  });

  return imageFileResponse(image);
});

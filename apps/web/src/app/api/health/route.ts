import type { HealthResponse } from "@lanbort/contracts";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

/** Liveness probe without any data or configuration dependency. */
export const GET = route.public(async () => {
  const body = {
    status: "ok",
    service: "lanbort-web",
  } satisfies HealthResponse;

  return Response.json(body);
});

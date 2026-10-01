import type { HealthResponse } from "@lanbort/contracts";

export const dynamic = "force-dynamic";

export function GET() {
  const body = {
    status: "ok",
    service: "lanbort-web",
  } satisfies HealthResponse;

  return Response.json(body, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

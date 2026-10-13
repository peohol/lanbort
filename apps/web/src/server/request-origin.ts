import { headers } from "next/headers";
import { stableVercelHost } from "@/navigation/origins";
import { serverEnv } from "@/server/env";

/** Whether this request arrived through the stable alternative Vercel host. */
export async function onStableVercelHost(): Promise<boolean> {
  const requestHeaders = await headers();
  const raw =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "";
  const first = raw.split(",")[0]?.trim().toLowerCase() ?? "";
  const hostname = first.startsWith("[") ? first : first.split(":")[0];

  return hostname === stableVercelHost;
}

/** The same app path on the configured canonical origin, when configured. */
export function canonicalAppHref(path: string): string | null {
  const appUrl = serverEnv().APP_URL;
  return appUrl ? new URL(path, appUrl).toString() : null;
}

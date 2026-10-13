import { headers } from "next/headers";
import { CanonicalStewardshipNotice } from "@/components/canonical-stewardship-notice";
import { pagePathHeader } from "@/server/page-path";
import { canonicalAppHref } from "@/server/request-origin";

export default async function CanonicalStewardshipPage() {
  const path = (await headers()).get(pagePathHeader) ?? "/forvaltning";

  return <CanonicalStewardshipNotice href={canonicalAppHref(path)} />;
}

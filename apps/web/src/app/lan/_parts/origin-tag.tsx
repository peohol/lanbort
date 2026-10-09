import type { LoanOrigin } from "@lanbort/contracts";
import { ContextTag } from "@/components/tag";
import { originLabel } from "@/presentation/loan-requests";

/**
 * Where a request or loan came from, in the page's header (UX-PRIV-003,
 * KF1 v2): an environment or «Direkte mellom venner».
 */
export function OriginTag({ origin }: { origin: LoanOrigin }) {
  return (
    <ContextTag
      label="Gjennom"
      icon={origin.kind === "direct" ? "people" : "environment"}
    >
      {originLabel(origin)}
    </ContextTag>
  );
}

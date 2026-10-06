import type { CaseSummary } from "@lanbort/contracts";
import Link from "next/link";
import { Tag } from "@/components/tag";
import { caseHref } from "@/navigation/routes";
import { anchorFor } from "@/navigation/targets";
import { caseKindLabels, describeHandling } from "@/presentation/cases";
import { formatTime } from "@/presentation/dates";

/**
 * Cases in a list, newest first: what kind, where, when, and how the
 * handling stands. Each leads to the case itself.
 */
export function CaseList({
  label,
  cases,
  viewer,
  environmentName,
  nameOf,
  more,
}: {
  label: string;
  cases: readonly CaseSummary[];
  viewer: { readonly userId: string; readonly asHandler: boolean };
  environmentName: (id: string) => string | null;
  nameOf: (userId: string) => string;
  /** The address of the next page, when there is one. */
  more: string | null;
}) {
  return (
    <>
      <ul className="entries" aria-label={label}>
        {cases.map((c) => {
          const handling = describeHandling(c, viewer, nameOf);
          const where = c.environmentId && environmentName(c.environmentId);

          return (
            <li key={c.id} id={anchorFor("case", c.id)} className="entry">
              <Link href={caseHref(c.id)}>{caseKindLabels[c.kind]}</Link>
              <span className="entry-detail">
                {where ? `${where} · ` : ""}Åpnet {formatTime(c.openedAt)}
              </span>
              <span>
                <Tag tone={handling.tone}>{handling.text}</Tag>
              </span>
            </li>
          );
        })}
      </ul>
      {more && (
        <p className="link-row">
          <a href={more}>Vis eldre saker</a>
        </p>
      )}
    </>
  );
}

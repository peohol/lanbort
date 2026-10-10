import type { CaseSummary } from "@lanbort/contracts";
import { MenuList, MenuRow } from "@/components/menu-list";
import { Tag } from "@/components/tag";
import { caseHref } from "@/navigation/routes";
import {
  caseKindIcons,
  caseTitle,
  describeHandling,
  loanClarifiedText,
  personIn,
} from "@/presentation/cases";
import { formatShortTime } from "@/presentation/dates";

/** Who reads the list: a participant, or a handler of the queue. */
export interface CaseListViewer {
  readonly userId: string;
  readonly asHandler: boolean;
}

/**
 * What a row says under its title: for a participant how the handling
 * stands and where, for a handler who it is from or who has it, and when.
 */
function detail(
  c: CaseSummary,
  viewer: CaseListViewer,
  where: string | null,
): string {
  const name = (userId: string | null) => personIn(c.people, userId);
  const when =
    c.status === "closed" && c.closedAt
      ? `Lukket ${formatShortTime(c.closedAt)}`
      : formatShortTime(c.openedAt);

  if (!viewer.asHandler) {
    const handling =
      c.status === "closed" ? null : describeHandling(c, viewer, () => "").text;

    return [handling, where, c.status === "closed" ? when : null]
      .filter(Boolean)
      .join(" · ");
  }

  const from =
    c.kind === "loan_mediation"
      ? c.participantUserIds.map(name).join(" og ")
      : c.kind === "environment_contact"
        ? null
        : `Meldt av ${name(c.participantUserIds[0] ?? null)}`;
  const holder =
    c.status === "open" &&
    c.assigneeUserId !== null &&
    c.assigneeUserId !== viewer.userId
      ? `${name(c.assigneeUserId)} har den`
      : null;
  const clarified =
    c.status === "open" && c.loanClarified ? loanClarifiedText : null;

  return [clarified ?? from, holder, when].filter(Boolean).join(" · ");
}

/**
 * Cases as rows of one card (Tomat kjerneflyt 8): what each is about, how
 * it stands, and «Din tur» where the reader is to write. Each leads to the
 * case itself.
 */
export function CaseList({
  label,
  cases,
  viewer,
  environmentName,
  more,
}: {
  /** The id of the heading that names the list. */
  label: string;
  cases: readonly CaseSummary[];
  viewer: CaseListViewer;
  environmentName: (id: string) => string | null;
  /** The address of the next page, when there is one. */
  more?: string | null;
}) {
  return (
    <>
      <MenuList label={label}>
        {cases.map((c) => {
          const opener = personIn(c.people, c.participantUserIds[0] ?? null);

          return (
            <MenuRow
              key={c.id}
              href={caseHref(c.id)}
              icon={caseKindIcons[c.kind]}
              label={caseTitle(c, { handler: viewer.asHandler, opener })}
              detail={detail(
                c,
                viewer,
                c.environmentId && environmentName(c.environmentId),
              )}
              end={c.yourTurn ? <Tag tone="attention">Din tur</Tag> : undefined}
            />
          );
        })}
      </MenuList>
      {more && (
        <p className="link-row">
          <a href={more}>Vis eldre saker</a>
        </p>
      )}
    </>
  );
}

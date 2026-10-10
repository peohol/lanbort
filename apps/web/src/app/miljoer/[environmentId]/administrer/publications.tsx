import type {
  AdministeredMembership,
  Environment,
  EnvironmentPublicationList,
  ObjectCategory,
  PublicationStatus,
} from "@lanbort/contracts";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { MoreActions } from "@/components/more-actions";
import { formatTime } from "@/presentation/dates";
import {
  administrationPageHref,
  objectApprovalConsequences,
  publicationStatusLabels,
} from "@/presentation/environment-admin";
import { categoryLabel } from "@/presentation/objects";
import { memberName } from "./memberships";

type Reviewed = keyof typeof publicationStatusLabels;
type Publication = EnvironmentPublicationList["publications"][number];

/** The statuses administrators review, in the order they need attention. */
export const reviewedStatuses = [
  "pending",
  "active",
  "rejected",
  "blocked",
] as const satisfies readonly Reviewed[];

/** The query parameter that pages one status's publications. */
export const olderParam = (status: PublicationStatus) => `eldre-${status}`;

/**
 * Things in the environment (PS-ENV-011, PS-OBJ-017): whether they need
 * approval, and each status with what an administrator can do about it.
 * An administrator who owns a thing does not decide on it (PS-USR-009).
 */
export function Publications({
  environment,
  pages,
  members,
  categories,
  query,
}: {
  environment: Environment;
  pages: readonly EnvironmentPublicationList[];
  members: readonly AdministeredMembership[];
  categories: readonly ObjectCategory[];
  query: Record<string, string | string[] | undefined>;
}) {
  const required = environment.requiresObjectApproval;
  const empty = pages.every((page) => page.publications.length === 0);
  const publisher = (userId: string) => {
    const member = members.find((m) => m.userId === userId);
    return member ? memberName(member) : "et tidligere medlem";
  };

  return (
    <>
      <p>
        {required
          ? "Nye ting må godkjennes av en administrator før medlemmene ser dem."
          : "Ting blir synlige for medlemmene med en gang de legges ut."}
      </p>
      {environment.state === "active" && (
        <ConfirmAction
          label={required ? "Slå av godkjenning" : "Krev godkjenning"}
          title={
            required
              ? "Slå av godkjenning av ting"
              : "Krev godkjenning av nye ting"
          }
          consequences={objectApprovalConsequences(!required)}
          confirmLabel={required ? "Slå av godkjenning" : "Krev godkjenning"}
          path="/api/environments/object-approval"
          body={{ environmentId: environment.id, required: !required }}
        />
      )}
      {empty && <EmptyState>Ingen ting er lagt ut i miljøet ennå.</EmptyState>}
      {reviewedStatuses.map((status, index) => {
        const page = pages[index];
        if (!page || page.publications.length === 0) return null;
        const headingId = `ting-${status}`;

        return (
          <section key={status} aria-labelledby={headingId}>
            <h2 id={headingId}>{publicationStatusLabels[status].heading}</h2>
            <ul className="entries">
              {page.publications.map((publication) => (
                <PublicationEntry
                  key={publication.id}
                  environmentId={environment.id}
                  publication={publication}
                  category={categoryLabel(
                    categories,
                    publication.object.categoryId,
                  )}
                  publishedBy={publisher(publication.publishedByUserId)}
                />
              ))}
            </ul>
            {page.nextCursor && (
              <p className="link-row">
                <a
                  href={`${administrationPageHref(environment.id, "things")}?${new URLSearchParams(
                    {
                      ...singles(query),
                      [olderParam(status)]: page.nextCursor,
                    },
                  )}#${headingId}`}
                >
                  Vis eldre
                </a>
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

const singles = (query: Record<string, string | string[] | undefined>) =>
  Object.fromEntries(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

function PublicationEntry({
  environmentId,
  publication,
  category,
  publishedBy,
}: {
  environmentId: string;
  publication: Publication;
  category: string;
  publishedBy: string;
}) {
  const titleId = `publisering-${publication.id}`;
  const { title, description } = publication.object;

  return (
    <li className="entry" id={`p-${publication.id}`}>
      <strong id={titleId}>{title}</strong>
      <span className="entry-detail">
        {`${category} · lagt ut av ${publishedBy} ${formatTime(publication.createdAt)}`}
      </span>
      <p className="message-text">{description}</p>
      {publication.ownedByYou ? (
        <p className="quiet">
          Du eier denne tingen, så en annen administrator avgjør.
        </p>
      ) : (
        <div className="actions" role="group" aria-labelledby={titleId}>
          <PublicationActions
            body={{ environmentId, publicationId: publication.id }}
            status={publication.status as Reviewed}
            title={title}
          />
        </div>
      )}
    </li>
  );
}

const removal = (title: string) => ({
  gone: [`${title} vises ikke lenger for medlemmene i dette miljøet.`],
  stays: [
    "Lån som allerede er avtalt, fortsetter.",
    "Tingen finnes fortsatt hos eieren.",
  ],
});

/** What can be done with a publication in each status. */
function PublicationActions({
  body,
  status,
  title,
}: {
  body: { environmentId: string; publicationId: string };
  status: Reviewed;
  title: string;
}) {
  const approve = (label: string) => (
    <ActionButton
      label={label}
      path="/api/environments/publications/approve"
      body={body}
      primary
    />
  );
  const block = (
    <ConfirmAction
      label="Sperr"
      title={`Sperr ${title}`}
      consequences={{
        ...removal(title),
        affects: [
          "Sperren står til en administrator opphever den, også om godkjenning slås av.",
        ],
      }}
      confirmLabel={`Sperr ${title}`}
      path="/api/environments/publications/block"
      body={body}
      danger
    />
  );

  switch (status) {
    case "pending":
      return (
        <>
          {approve("Godkjenn")}
          <ConfirmAction
            label="Avvis"
            title={`Avvis ${title}`}
            consequences={{
              gone: [`${title} blir ikke synlig i miljøet.`],
              affects: ["Avvisningen står til en administrator endrer den."],
            }}
            confirmLabel={`Avvis ${title}`}
            path="/api/environments/publications/reject"
            body={body}
          />
          <MoreActions>{block}</MoreActions>
        </>
      );
    case "active":
      return (
        <MoreActions>
          <ConfirmAction
            label="Fjern fra miljøet"
            title={`Fjern ${title} fra miljøet`}
            consequences={{
              ...removal(title),
              affects: ["Avvisningen står til en administrator endrer den."],
            }}
            confirmLabel={`Fjern ${title}`}
            path="/api/environments/publications/reject"
            body={body}
          />
          {block}
        </MoreActions>
      );
    case "rejected":
      return approve("Godkjenn likevel");
    case "blocked":
      return (
        <ActionButton
          label="Opphev sperren"
          path="/api/environments/publications/unblock"
          body={body}
        />
      );
  }
}

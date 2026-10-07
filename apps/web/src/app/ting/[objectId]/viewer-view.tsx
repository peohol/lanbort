import type {
  Environment,
  LoanRequestPreview,
  ObjectCategory,
  OwnAccount,
} from "@lanbort/contracts";
import {
  collectPages,
  listLoanRequests,
  listObjectQuestions,
} from "@lanbort/domain";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { MoreActions } from "@/components/more-actions";
import { OwnerNames } from "@/components/owner-names";
import { ObjectGallery } from "@/components/object-gallery";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag } from "@/components/tag";
import { findHref } from "@/navigation/areas";
import { newCaseHref } from "@/navigation/cases";
import {
  morePagesHref,
  pagesShown,
  type SearchParams,
} from "@/navigation/list-pages";
import {
  loanRequestHref,
  objectHref,
  type ObjectOrigin,
  requestObjectHref,
} from "@/navigation/routes";
import { loanRequestStatusLabels } from "@/presentation/loans";
import {
  categoryLabel,
  describeAvailability,
  formatInterval,
  ownersLabel,
} from "@/presentation/objects";
import { pageQuery } from "@/server/session";
import { Questions, questionsId } from "./questions";

/** An environment's picture of a thing, read through its publication. */
const environmentImage =
  (environmentId: string, objectId: string) => (imageId: string) =>
    `/api/environments/objects/image?${new URLSearchParams({ environmentId, objectId, imageId })}`;

/** The caller's own open request for the thing, if they have one. */
async function openRequestFor(objectId: string) {
  const own = await pageQuery(listLoanRequests, {
    role: "borrower",
    state: "open",
  });

  return own?.requests.find((request) => request.objectId === objectId);
}

/**
 * A thing as someone who may borrow it sees it (UX-JRN-004, UX-JRN-013):
 * through one environment, or directly between friends, said as its
 * context (UX-PRIV-003). Through an environment its owners who are members
 * there are named (PS-ENV-015); what blocks it is not said (UX-PRIV-004). The next step is to ask to borrow it; in an
 * environment the thing can also be followed and asked about there
 * (PS-OBJ-014–015).
 */
export async function ViewerView({
  account,
  object,
  environment,
  categories,
  today,
  query,
}: {
  account: OwnAccount;
  object: LoanRequestPreview;
  environment: Environment | null;
  categories: readonly ObjectCategory[];
  today: string;
  query: SearchParams;
}) {
  const origin: ObjectOrigin = environment
    ? { kind: "environment", environmentId: environment.id }
    : { kind: "direct" };
  const [openRequest, questions] = await Promise.all([
    openRequestFor(object.objectId),
    environment
      ? collectPages(
          (cursor) =>
            pageQuery(listObjectQuestions, {
              environmentId: environment.id,
              objectId: object.objectId,
              cursor,
            }),
          (page) => page.questions,
          pagesShown(query, questionsId),
        )
      : null,
  ]);

  return (
    <main>
      <PageHeader
        title={object.title}
        back={{ href: findHref, label: "Finn" }}
        context={
          <>
            <ContextTag label="Sett gjennom">
              {environment ? environment.name : "Venner"}
            </ContextTag>
            <ContextTag label="Kategori">
              {categoryLabel(categories, object.categoryId)}
            </ContextTag>
          </>
        }
      />
      {environment && (
        <ObjectGallery
          title={object.title}
          images={object.images}
          src={environmentImage(environment.id, object.objectId)}
        />
      )}
      <StatusCard
        status={describeAvailability(object, today)}
        tone={object.availableForNewLoans ? "positive" : "neutral"}
        who={
          openRequest && (
            <>
              Du har en forespørsel her:{" "}
              <Link href={loanRequestHref(openRequest.id)}>
                {loanRequestStatusLabels[openRequest.status]}
              </Link>
            </>
          )
        }
        actions={
          <>
            {object.availableForNewLoans && (
              <Link
                className="button button-primary"
                href={requestObjectHref(object.objectId, origin)}
              >
                Be om å låne
              </Link>
            )}
            {environment && (
              <ActionButton
                label={object.following ? "Slutt å følge" : "Følg tingen"}
                path={
                  object.following
                    ? "/api/object-subscriptions/cancel"
                    : "/api/object-subscriptions"
                }
                body={{ objectId: object.objectId }}
                idempotent={false}
              />
            )}
          </>
        }
      >
        {environment && (
          <p className="help">
            {object.following
              ? "Du følger tingen og får beskjed når den blir ledig igjen eller endres."
              : "Følg tingen for å få beskjed når den blir ledig igjen eller endres."}
          </p>
        )}
      </StatusCard>
      <section aria-labelledby="om-tingen">
        <h2 id="om-tingen">Om tingen</h2>
        <dl className="facts">
          {object.owners.length > 0 && (
            <>
              <dt>{ownersLabel(object.owners)}</dt>
              <dd>
                <OwnerNames owners={object.owners} />
              </dd>
            </>
          )}
          <dt>Beskrivelse</dt>
          <dd className="message-text">{object.description}</dd>
          <dt>Vilkår</dt>
          <dd className="message-text">
            {object.loanTerms ?? "Ingen egne vilkår"}
          </dd>
          <dt>Ledig</dt>
          <dd>
            {object.effectiveAvailability.length === 0
              ? "Ikke ledig for nye lån nå"
              : object.effectiveAvailability.map(formatInterval).join(", ")}
          </dd>
        </dl>
      </section>
      {environment && questions && (
        <Questions
          environmentId={environment.id}
          objectId={object.objectId}
          userId={account.userId}
          questions={questions.items}
          more={
            questions.nextCursor === null
              ? null
              : morePagesHref(
                  objectHref(object.objectId),
                  query,
                  questionsId,
                  questionsId,
                )
          }
        />
      )}
      <MoreActions>
        <Link
          className="button"
          href={newCaseHref({
            kind: "report",
            environmentId: environment?.id ?? null,
            subject: { kind: "object", id: object.objectId },
          })}
        >
          Rapporter tingen
        </Link>
      </MoreActions>
    </main>
  );
}

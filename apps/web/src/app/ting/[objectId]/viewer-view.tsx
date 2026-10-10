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
import { environmentImageHref } from "@/presentation/object-images";
import { formatDay } from "@/presentation/dates";
import {
  availabilityLine,
  availabilityStatus,
  categoryLabel,
  freeDays,
  freeThrough,
  seenBecause,
} from "@/presentation/objects";
import { pageQuery } from "@/server/session";
import { OriginTag } from "@/app/lan/_parts/origin-tag";
import { Questions, questionsId } from "./questions";
import styles from "./viewer-view.module.css";
import { WeekStrip } from "./week-strip";

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

  const status = availabilityStatus(object, today);
  const days = freeDays(object, today);
  const through = freeThrough(object, days);
  const [onlyOwner] = object.owners.length === 1 ? object.owners : [];

  return (
    <main>
      <PageHeader
        title={object.title}
        kind="Ting"
        back={{ href: findHref, label: "Finn" }}
        context={
          <>
            {object.owners.length > 0 && <OwnerNames owners={object.owners} />}
            <OriginTag
              origin={
                environment
                  ? { kind: "environment", environment }
                  : { kind: "direct" }
              }
            />
          </>
        }
      />
      {environment && (
        <ObjectGallery
          title={object.title}
          images={object.images}
          src={(imageId) =>
            environmentImageHref(environment.id, object.objectId, imageId)
          }
        />
      )}
      <StatusCard
        status={status.label}
        tone={status.tone}
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
          object.availableForNewLoans && (
            <Link
              className="button button-primary"
              href={requestObjectHref(object.objectId, origin)}
            >
              Be om å låne
            </Link>
          )
        }
      >
        {days.some(({ free }) => free) && (
          <>
            <WeekStrip days={days} />
            <p>
              Fylte dager er ledige.
              {through && ` Ledig til og med ${formatDay(through)}.`}
            </p>
          </>
        )}
        <div className={styles.terms}>
          <h3>{onlyOwner ? `Vilkår fra ${onlyOwner.realName}` : "Vilkår"}</h3>
          <p className="message-text">
            {object.loanTerms ?? "Ingen egne vilkår"}
          </p>
        </div>
      </StatusCard>
      <p className="help">
        {seenBecause(
          environment && {
            name: environment.name,
            member: environment.membership?.state === "active",
          },
        )}
      </p>
      {environment && (
        <div className="actions">
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
          {questions && (
            <Link className="button" href={`#${questionsId}`}>
              {questions.nextCursor === null
                ? `Spørsmål (${questions.items.length})`
                : "Spørsmål og svar"}
            </Link>
          )}
        </div>
      )}
      {environment && (
        <p className="help">
          {object.following
            ? "Du følger tingen og får beskjed når den blir ledig igjen eller endres."
            : "Følg tingen for å få beskjed når den blir ledig igjen eller endres."}
        </p>
      )}
      <section aria-labelledby="om-tingen">
        <h2 id="om-tingen">Om tingen</h2>
        <dl className="facts">
          <dt>Ledig</dt>
          <dd>
            {object.availableForNewLoans
              ? availabilityLine(object.effectiveAvailability, today)
              : status.label}
          </dd>
          <dt>Kategori</dt>
          <dd>{categoryLabel(categories, object.categoryId)}</dd>
          <dt>Beskrivelse</dt>
          <dd className="message-text">{object.description}</dd>
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

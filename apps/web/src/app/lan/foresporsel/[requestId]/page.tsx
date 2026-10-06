import type { LoanRequestDetail } from "@lanbort/contracts";
import { readLoanRequest } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { MoreActions } from "@/components/more-actions";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag, Tag } from "@/components/tag";
import { loansHref } from "@/navigation/areas";
import { loanHref, objectHref } from "@/navigation/routes";
import {
  formatPeriod,
  formatShortPeriod,
  formatTime,
} from "@/presentation/dates";
import {
  describeLoanRequest,
  requestOriginLabel,
  responsibilityDeclaration,
} from "@/presentation/loan-requests";
import { personName } from "@/presentation/loan-status";
import { formatDesiredPeriod, loanRoleLabels } from "@/presentation/loans";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Forespørsel – Lånbort" };

/** Requests that still wait for an answer or for the borrower. */
const open = (request: LoanRequestDetail) =>
  ["requested", "awaiting_terms_confirmation", "on_hold"].includes(
    request.status,
  );

const terms = (loanTerms: string | null | undefined) =>
  loanTerms ?? "Ingen egne vilkår";

/** The steps of the request's side the reader is on, the next one first. */
function Steps({ request }: { request: LoanRequestDetail }) {
  const path = `/api/loan-requests/${request.id}`;
  const title = request.object?.title ?? "tingen";
  const name = personName(request.borrower);
  const declaration = request.responsibility;
  const declarationStep = declaration && !declaration.acceptedByYou && (
    <ActionButton
      label="Godta ansvarserklæringen"
      path={`${path}/responsibility`}
      body={{ declarationVersion: declaration.version }}
      primary
    />
  );

  if (request.status === "approved") {
    return request.loanId ? (
      <Link className="button button-primary" href={loanHref(request.loanId)}>
        Gå til lånet
      </Link>
    ) : null;
  }

  if (!open(request)) return null;

  if (request.role === "borrower") {
    return (
      <>
        {request.pendingTerms && (
          <ActionButton
            label="Bekreft de nye vilkårene"
            path={`${path}/confirm-terms`}
            body={{ termsVersion: request.pendingTerms.version }}
            primary
          />
        )}
        {declarationStep}
        <MoreActions>
          <ConfirmAction
            label="Trekk forespørselen"
            title={`Trekk forespørselen om å låne ${title}?`}
            consequences={{
              gone: ["Forespørselen, også om eieren ikke har svart ennå"],
              stays: ["Du kan be om å låne tingen igjen senere"],
              affects: ["Eieren ser at forespørselen er trukket"],
            }}
            confirmLabel="Trekk forespørselen"
            path={`${path}/withdraw`}
            body={{}}
            danger
          />
        </MoreActions>
      </>
    );
  }

  const period = request.approval?.period;
  const ready =
    period &&
    (!declaration ||
      (declaration.acceptedByYou && declaration.acceptedByBorrower));
  const others = request.approval?.endsOtherRequests ?? 0;

  return (
    <>
      {declarationStep}
      {ready && (
        <ConfirmAction
          label={`Godkjenn lån ${formatShortPeriod(period)}`}
          title={`Godkjenn lånet av ${title}?`}
          consequences={{
            stays: [
              `${name} låner ${title} ${formatPeriod(period)}, og perioden holdes av`,
              `Vilkår: ${terms(request.confirmedTerms?.loanTerms)}`,
              "Dere kan begge avlyse før overleveringen",
            ],
            gone:
              others > 0
                ? [
                    `${others} ${others === 1 ? "annen forespørsel" : "andre forespørsler"} om samme tid avsluttes`,
                  ]
                : [],
            affects: [`${name} får vite at lånet er avtalt`],
          }}
          confirmLabel={`Godkjenn lån ${formatShortPeriod(period)}`}
          path={`${path}/approve`}
          body={{}}
          next={loanHref("{loanId}")}
        />
      )}
      <ConfirmAction
        label="Avslå"
        title={`Avslå forespørselen fra ${name}?`}
        consequences={{
          gone: [`Forespørselen om å låne ${title}`],
          stays: ["Tingen og andre forespørsler om den"],
          affects: [`${name} ser at forespørselen ble avslått`],
        }}
        confirmLabel="Avslå forespørselen"
        path={`${path}/decline`}
        body={{}}
        danger
      />
    </>
  );
}

/** What the lender needs to know before answering (UX-JRN-005). */
function approvalNote(request: LoanRequestDetail): ReactNode {
  if (request.role !== "lender" || request.status !== "requested") return null;
  const approval = request.approval;

  if (!approval?.period) {
    return (
      <p>
        Tingen er ikke ledig i hele tiden som er ønsket. Du kan avslå
        forespørselen, eller vente om noe annet blir avlyst.
      </p>
    );
  }

  return (
    <p>
      Godkjenner du, avtaler dere {formatPeriod(approval.period)}.
      {approval.endsOtherRequests > 0 &&
        ` Da avsluttes ${approval.endsOtherRequests} ${approval.endsOtherRequests === 1 ? "annen forespørsel" : "andre forespørsler"} om samme tid.`}
    </p>
  );
}

/**
 * One loan request for one of its parties (WP-83, UX-JRN-004–006): what it
 * waits for and from whom, and the next step first. The borrower can
 * withdraw it and confirm new terms; a lender sees the period, the terms
 * and what it collides with, and approves with a button that names the
 * agreement. Approving leads to the loan's own page.
 */
export default async function LoanRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  await requirePageAccount();
  const { requestId } = await params;
  const request = await pageQueryOrNotFound(readLoanRequest, { requestId });
  const status = describeLoanRequest(request);
  const lender = request.role === "lender";
  const origin =
    request.origin.kind === "environment" && request.origin.environment
      ? {
          kind: "environment" as const,
          environmentId: request.origin.environment.id,
        }
      : { kind: "direct" as const };
  const declaration = request.responsibility;

  return (
    <main>
      <PageHeader
        title={request.object?.title ?? "Tingen finnes ikke lenger"}
        back={{ href: loansHref, label: "Lån" }}
        context={
          <>
            <ContextTag label="Gjennom">
              {requestOriginLabel(request)}
            </ContextTag>
            <Tag>{loanRoleLabels[request.role]}</Tag>
          </>
        }
      />
      <StatusCard
        status={status.text}
        tone={status.tone}
        actions={<Steps request={request} />}
      >
        {approvalNote(request)}
      </StatusCard>
      {request.pendingTerms && (
        <section aria-labelledby="nye-vilkar">
          <h2 id="nye-vilkar">Nye vilkår</h2>
          <p className="message-text">
            {terms(request.pendingTerms.loanTerms)}
          </p>
        </section>
      )}
      <section aria-labelledby="foresporselen">
        <h2 id="foresporselen">Forespørselen</h2>
        <dl className="facts">
          {lender && (
            <>
              <dt>Fra</dt>
              <dd>{personName(request.borrower)}</dd>
            </>
          )}
          <dt>Ønsket tid</dt>
          <dd>{formatDesiredPeriod(request.start, request.end)}</dd>
          <dt>Melding</dt>
          <dd className="message-text">{request.message ?? "Ingen melding"}</dd>
          <dt>Vilkår</dt>
          <dd className="message-text">
            {terms(request.confirmedTerms?.loanTerms)}
          </dd>
          <dt>Sendt</dt>
          <dd>{formatTime(request.createdAt)}</dd>
        </dl>
        <p className="help">
          Bare dere som er parter i lånet ser meldingen. Den er ikke
          ende-til-ende-kryptert; videre samtale skjer i privat chat.
        </p>
        {request.objectId && request.object && (
          <p className="link-row">
            <Link
              href={objectHref(request.objectId, lender ? undefined : origin)}
            >
              Se tingen
            </Link>
          </p>
        )}
      </section>
      {declaration && open(request) && (
        <section aria-labelledby="ansvar">
          <h2 id="ansvar">Ansvarserklæring</h2>
          <p>Lånet er direkte mellom venner. Begge må godta dette:</p>
          <ul>
            {responsibilityDeclaration.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p>
            {declaration.acceptedByBorrower
              ? "Låntakeren har godtatt."
              : "Låntakeren har ikke godtatt ennå."}{" "}
            {declaration.acceptedByLender
              ? "Eieren har godtatt."
              : "Eieren har ikke godtatt ennå."}
          </p>
        </section>
      )}
    </main>
  );
}

"use client";

import type {
  CreateLoanRequest,
  DesiredEnd,
  DesiredStart,
  LoanRequestOrigin,
  LoanRequestResult,
  LoanRequest,
  ShownOwner,
} from "@lanbort/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { Icon } from "@/components/icon";
import { OwnerNames } from "@/components/owner-names";
import { PageHeader } from "@/components/page-header";
import { useCommand } from "@/components/use-command";
import { Choice } from "@/app/lan/_parts/choice";
import styles from "@/app/lan/_parts/loan.module.css";
import { OriginTag } from "@/app/lan/_parts/origin-tag";
import { loanRequestHref } from "@/navigation/routes";
import { addDays, formatShortPeriod } from "@/presentation/dates";
import {
  originLabel,
  requestMessageHelp,
  responsibilityDeclaration,
} from "@/presentation/loan-requests";
import { formatDesiredPeriod } from "@/presentation/loans";

const startChoices = [
  { value: "date", label: "Velg dag" },
  { value: "asap", label: "Så snart som mulig" },
] as const;

const endChoices = [
  { value: "date", label: "Dato" },
  { value: "duration", label: "Varighet" },
] as const;

/**
 * The request in two short steps (UX-JRN-004, KF1 v2): when, then a review
 * of exactly what is sent, with an optional message and, between friends,
 * the declaration (PS-LOAN-003). Time is asked for once: a last day or a
 * number of days, never both. What is filled in stays while going back.
 * Nothing is agreed until an owner approves, on the terms shown.
 */
export function RequestForm({
  objectId,
  title,
  origin,
  shownOrigin,
  owners,
  termsVersion,
  loanTerms,
  declarationVersion,
  availability,
  from,
  today,
}: {
  objectId: string;
  title: string;
  origin: LoanRequestOrigin;
  /** Where the request is made, as the reader sees it. */
  shownOrigin: LoanRequest["origin"];
  /** Through an environment, the owners asked; empty between friends. */
  owners: readonly ShownOwner[];
  termsVersion: number;
  loanTerms: string | null;
  /** Between friends: the declaration to accept; null otherwise. */
  declarationVersion: number | null;
  /** When the thing is free, in words. */
  availability: string;
  /** The thing's page, where the request was started. */
  from: { href: string; label: string };
  today: string;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [startKind, setStartKind] = useState<DesiredStart["kind"]>("date");
  const [startDate, setStartDate] = useState(today);
  const [endKind, setEndKind] = useState<DesiredEnd["kind"]>("date");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [message, setMessage] = useState("");
  const heading = useRef<HTMLSpanElement>(null);
  const ids = useId();
  const command = useCommand<LoanRequestResult>({
    path: "/api/loan-requests",
    done: "Forespørselen er sendt",
    after: ({ requestId }) => loanRequestHref(requestId),
    messages: {
      conflict:
        "Tingen er ikke ledig i hele tiden du ba om, eller vilkårene er endret. Siden viser nå det som gjelder. Se over og send igjen om det fortsatt passer.",
    },
  });

  const start: DesiredStart =
    startKind === "asap" ? { kind: "asap" } : { kind: "date", date: startDate };
  const end: DesiredEnd =
    endKind === "date"
      ? { kind: "date", date: endDate }
      : { kind: "duration", days: Number(days) };
  const earliestEnd = start.kind === "date" ? start.date : today;
  const chosen =
    (start.kind === "asap" || start.date) &&
    (end.kind === "date" ? end.date : end.days > 0)
      ? formatDesiredPeriod(start, end)
      : null;
  // A dated request names its days on the button (UX-INT-003).
  const lastDay =
    start.kind === "date" && start.date
      ? end.kind === "date"
        ? end.date
        : end.days > 0
          ? addDays(start.date, end.days - 1)
          : ""
      : "";
  const sendLabel =
    start.kind === "date" && lastDay >= start.date
      ? `Send forespørsel ${formatShortPeriod({ start: start.date, end: lastDay })}`
      : "Send forespørselen";
  const owner = owners.length === 1 ? (owners[0]?.realName ?? null) : null;

  // Focus follows the step, so the keyboard and a screen reader land on it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [reviewing]);

  function send() {
    const body: CreateLoanRequest = {
      objectId,
      origin,
      start,
      end,
      ...(message.trim() ? { message: message.trim() } : {}),
      termsVersion,
      ...(declarationVersion === null
        ? {}
        : { responsibilityDeclarationVersion: declarationVersion }),
    };
    void command.run(body);
  }

  const field = (name: string) => `${ids}-${name}`;

  return (
    <>
      <PageHeader
        kind={`Be om å låne · ${reviewing ? "2 av 2" : "1 av 2"}`}
        title={
          <span ref={heading} tabIndex={-1}>
            {reviewing ? "Se over og send" : `Når vil du låne ${title}?`}
          </span>
        }
        label={title}
        back={from}
        home="find"
        task
        context={<OriginTag origin={shownOrigin} />}
      >
        {reviewing ? undefined : availability}
      </PageHeader>
      {reviewing && (
        <p>
          <button
            type="button"
            className="back-link"
            onClick={() => setReviewing(false)}
          >
            <Icon name="back" /> Periode
          </button>
        </p>
      )}
      <form
        hidden={reviewing}
        className={styles.column}
        onSubmit={(event) => {
          event.preventDefault();
          setReviewing(true);
        }}
      >
        <Choice
          legend="Start"
          name={field("start")}
          value={startKind}
          options={startChoices}
          onChange={setStartKind}
        />
        {startKind === "date" && (
          <Field id={field("start-date")} label="Første dag">
            <input
              id={field("start-date")}
              type="date"
              required
              min={today}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
        )}
        <Choice
          legend="Slutt"
          name={field("end")}
          value={endKind}
          options={endChoices}
          onChange={setEndKind}
        />
        {endKind === "date" ? (
          <Field id={field("end-date")} label="Siste dag">
            <input
              id={field("end-date")}
              type="date"
              required
              min={earliestEnd}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        ) : (
          <Field id={field("days")} label="Antall dager">
            <input
              id={field("days")}
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={3650}
              step={1}
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </Field>
        )}
        {chosen && (
          <p className={styles.body} aria-live="polite">
            Valgt: <strong>{chosen}</strong>
          </p>
        )}
        <div className="actions">
          <button type="submit">Videre</button>
        </div>
      </form>
      {reviewing && (
        <form
          className={styles.column}
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <section className={styles.flat} aria-label="Forespørselen">
            <dl className="facts">
              <dt>Ting</dt>
              <dd>{title}</dd>
              {owners.length > 0 && (
                <>
                  <dt>Fra</dt>
                  <dd>
                    <OwnerNames owners={owners} />
                  </dd>
                </>
              )}
              <dt>Periode</dt>
              <dd>{formatDesiredPeriod(start, end)}</dd>
              <dt>Vilkår</dt>
              <dd className="message-text">
                {loanTerms ?? "Ingen egne vilkår"}
              </dd>
              <dt>Kontekst</dt>
              <dd>{originLabel(shownOrigin)}</dd>
            </dl>
          </section>
          <Field
            id={field("message")}
            label={`Melding til ${owner ?? "eieren"} (valgfri)`}
            help={requestMessageHelp(owner ?? "Eieren")}
          >
            <textarea
              id={field("message")}
              rows={3}
              maxLength={2000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              {...describedBy(field("message"), true)}
            />
          </Field>
          {declarationVersion !== null && (
            <fieldset>
              <legend>Ansvarserklæring</legend>
              <p>Når dere låner direkte mellom venner, gjelder dette:</p>
              <ul>
                {responsibilityDeclaration.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <div className="checkbox">
                <input id={field("declaration")} type="checkbox" required />
                <label htmlFor={field("declaration")}>
                  Jeg godtar ansvarserklæringen for dette lånet
                </label>
              </div>
            </fieldset>
          )}
          <p className={styles.note}>
            <strong>Ingenting er avtalt ennå.</strong> Lånet blir avtalt når{" "}
            {owner ?? "eieren"} godkjenner, på vilkårene over. Til da kan du
            trekke forespørselen.
          </p>
          <div className="actions">
            <BusyButton type="submit" busy={command.pending}>
              {sendLabel}
            </BusyButton>
          </div>
          <ErrorText>{command.error}</ErrorText>
        </form>
      )}
    </>
  );
}

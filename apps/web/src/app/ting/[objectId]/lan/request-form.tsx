"use client";

import type {
  CreateLoanRequest,
  DesiredEnd,
  DesiredStart,
  LoanRequestOrigin,
  LoanRequestResult,
} from "@lanbort/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { BusyButton } from "@/components/busy-button";
import { ErrorText } from "@/components/error-text";
import { describedBy, Field } from "@/components/field";
import { useCommand } from "@/components/use-command";
import { loanRequestHref } from "@/navigation/routes";
import {
  requestMessageHelp,
  responsibilityDeclaration,
} from "@/presentation/loan-requests";
import { formatDesiredPeriod } from "@/presentation/loans";

/**
 * The request in one short course (UX-JRN-004): when, an optional message,
 * the terms (and between friends the declaration, PS-LOAN-003), then a
 * review of exactly what is sent. Time is asked for once: a last day or a
 * number of days, never both. What is filled in stays while going back.
 */
export function RequestForm({
  objectId,
  title,
  origin,
  originLabel,
  termsVersion,
  loanTerms,
  declarationVersion,
  today,
}: {
  objectId: string;
  title: string;
  origin: LoanRequestOrigin;
  originLabel: string;
  termsVersion: number;
  loanTerms: string | null;
  /** Between friends: the declaration to accept; null otherwise. */
  declarationVersion: number | null;
  today: string;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [startKind, setStartKind] = useState<DesiredStart["kind"]>("asap");
  const [startDate, setStartDate] = useState(today);
  const [endKind, setEndKind] = useState<DesiredEnd["kind"]>("duration");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState("");
  const [message, setMessage] = useState("");
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
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

  // Focus follows the step, so the keyboard and a screen reader land on it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (reviewing ? reviewHeading : formHeading).current?.focus();
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
      <form
        hidden={reviewing}
        onSubmit={(event) => {
          event.preventDefault();
          setReviewing(true);
        }}
      >
        <h2 ref={formHeading} tabIndex={-1}>
          Hva vil du låne den til?
        </h2>
        <Field id={field("start")} label="Når vil du starte?">
          <select
            id={field("start")}
            value={startKind}
            onChange={(event) =>
              setStartKind(event.target.value as DesiredStart["kind"])
            }
          >
            <option value="asap">Så snart som mulig</option>
            <option value="date">Fra en bestemt dag</option>
          </select>
        </Field>
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
        <Field
          id={field("end")}
          label="Hvor lenge?"
          help="Velg en siste dag eller et antall dager."
        >
          <select
            id={field("end")}
            value={endKind}
            onChange={(event) =>
              setEndKind(event.target.value as DesiredEnd["kind"])
            }
            {...describedBy(field("end"), true)}
          >
            <option value="duration">Et antall dager</option>
            <option value="date">Til og med en bestemt dag</option>
          </select>
        </Field>
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
        <Field
          id={field("message")}
          label="Melding til eieren"
          help={requestMessageHelp}
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
        <fieldset>
          <legend>Vilkår</legend>
          {loanTerms ? (
            <>
              <p className="message-text">{loanTerms}</p>
              <div className="checkbox">
                <input id={field("terms")} type="checkbox" required />
                <label htmlFor={field("terms")}>Jeg godtar vilkårene</label>
              </div>
            </>
          ) : (
            <p>Eieren har ingen egne vilkår for denne tingen.</p>
          )}
        </fieldset>
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
        <div className="actions">
          <button type="submit" className="button-primary">
            Se over forespørselen
          </button>
        </div>
      </form>
      {reviewing && (
        <section aria-labelledby={field("review")}>
          <h2 id={field("review")} ref={reviewHeading} tabIndex={-1}>
            Se over forespørselen
          </h2>
          <dl className="facts">
            <dt>Tingen</dt>
            <dd>{title}</dd>
            <dt>Gjennom</dt>
            <dd>{originLabel}</dd>
            <dt>Tid</dt>
            <dd>{formatDesiredPeriod(start, end)}</dd>
            <dt>Melding</dt>
            <dd className="message-text">
              {message.trim() || "Ingen melding"}
            </dd>
            <dt>Vilkår</dt>
            <dd>{loanTerms ? "Godtatt" : "Ingen egne vilkår"}</dd>
            {declarationVersion !== null && (
              <>
                <dt>Ansvarserklæring</dt>
                <dd>Godtatt</dd>
              </>
            )}
          </dl>
          <div className="actions">
            <BusyButton
              type="button"
              className="button-primary"
              busy={command.pending}
              onClick={send}
            >
              Send forespørselen
            </BusyButton>
            <button type="button" onClick={() => setReviewing(false)}>
              Endre
            </button>
          </div>
          <ErrorText>{command.error}</ErrorText>
        </section>
      )}
    </>
  );
}

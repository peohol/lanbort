"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { announce } from "./announcer";
import { BusyButton } from "./busy-button";
import { announceDataChanged } from "./data-changed";
import { ErrorText, fieldErrorProps } from "./error-text";
import { describedBy, Field, helpId } from "./field";
import {
  addPasskey,
  confirmWithPasskey,
  type PasskeyFailure,
  type PasskeyResult,
  passkeyErrorMessage,
} from "./passkeys";
import { useCommand } from "./use-command";

/**
 * The platform steward's passkey steps (ADR-0011, «Plattformforvaltning
 * v1»): confirming the session, adding a passkey and removing one. Each
 * runs the device's own dialog between two calls to the server, which
 * decides; the page is read again afterwards to show what holds.
 */

/** One ceremony at a time, with its failure said where it was started. */
function useCeremony() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<PasskeyFailure | null>(null);

  async function run<T>(
    steps: () => Promise<PasskeyResult<T>>,
  ): Promise<T | null> {
    if (pending) return null;
    setPending(true);
    setFailure(null);
    const result = await steps();
    setPending(false);

    if (!result.ok) {
      setFailure(result.failure);
      return null;
    }

    return result.data;
  }

  return { run, pending, failure, setFailure };
}

/** Confirms first when the session's confirmation is no longer fresh. */
const confirmedThen =
  <T,>(fresh: boolean, next: () => Promise<PasskeyResult<T>>) =>
  async (): Promise<PasskeyResult<T>> => {
    if (!fresh) {
      const confirmed = await confirmWithPasskey();
      if (!confirmed.ok) return confirmed;
    }

    return next();
  };

/**
 * «Bekreft med passkey»: the same sheet wherever a steward needs a fresh
 * confirmation (Tomat «Bekreft at det er deg»).
 */
export function PasskeyConfirm({
  label = "Bekreft med passkey",
  primary = true,
}: {
  label?: string;
  primary?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const errorId = useId();
  const { run, pending, failure, setFailure } = useCeremony();

  function close() {
    dialog.current?.close();
    setFailure(null);
  }

  async function confirm() {
    if (await run(confirmWithPasskey)) {
      close();
      announce("Ferdig: Bekreftet med passkey");
      announceDataChanged();
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        className={primary ? "button-primary" : undefined}
        onClick={() => dialog.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={titleId}
        onClose={close}
      >
        <h2 id={titleId}>Bekreft at det er deg</h2>
        <p>
          Bruk en av passkeyene dine for forvaltningen, på denne enheten eller
          en annen.
        </p>
        <p>
          Bekreftelsen gjelder i 10 minutter i denne økten. Så bekrefter du på
          nytt.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Avbryt
          </button>
          <BusyButton
            type="button"
            className="button-primary"
            busy={pending}
            busyNote="venter på passkeyen …"
            onClick={() => void confirm()}
          >
            Bruk passkey
          </BusyButton>
        </div>
        <ErrorText id={errorId}>
          {failure && passkeyErrorMessage(failure)}
        </ErrorText>
      </dialog>
    </>
  );
}

/** What fails only with an enrollment code. */
const codeMessages = {
  invalid_input:
    "Koden stemmer ikke, er brukt eller er utløpt. Be driftsansvarlig om en ny.",
  forbidden: "Koden ble ugyldig underveis. Be driftsansvarlig om en ny.",
  conflict:
    "Du har allerede en passkey. Bekreft med den og legg til den neste derfra.",
};

/**
 * Adds a passkey: the first with the enrollment code from the operator,
 * later ones from a session confirmed in the last 10 minutes, confirming
 * first when it is not. The name is given here; it cannot be changed later.
 */
export function AddPasskeyForm({
  needsCode,
  fresh,
  submitLabel,
  done,
}: {
  needsCode: boolean;
  fresh: boolean;
  submitLabel: string;
  /** Where the steward goes next; the page is read again when it is null. */
  done: string | null;
}) {
  const router = useRouter();
  const codeId = useId();
  const nameId = useId();
  const errorId = useId();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const { run, pending, failure } = useCeremony();
  const codeHelp =
    "Du får koden av driftsansvarlig, ansikt til ansikt eller i en telefonsamtale, aldri på e-post. Den gjelder for én passkey i 60 minutter, og en ny kode gjør den gamle ugyldig.";
  const nameHelp = "Så du kjenner den igjen i listen.";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(
      needsCode
        ? () => addPasskey({ name, enrollmentCode: code })
        : confirmedThen(fresh, () => addPasskey({ name })),
    );

    if (!added) return;

    announce(`Ferdig: Passkeyen «${name.trim()}» er lagt til`);
    announceDataChanged();
    if (done) {
      router.push(done);
    } else {
      setName("");
      router.refresh();
    }
  }

  const codeFailed = needsCode && failure === "invalid_input";

  return (
    <form onSubmit={(event) => void submit(event)} aria-busy={pending}>
      {needsCode && (
        <Field id={codeId} label="Registreringskode" help={codeHelp}>
          <input
            id={codeId}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            {...describedBy(codeId, codeHelp)}
            {...(codeFailed
              ? fieldErrorProps(failure, errorId, helpId(codeId))
              : {})}
          />
        </Field>
      )}
      <Field id={nameId} label="Navn på passkeyen" help={nameHelp}>
        <input
          id={nameId}
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...describedBy(nameId, nameHelp)}
        />
      </Field>
      {!needsCode && !fresh && (
        <p className="help">
          Det er mer enn 10 minutter siden du bekreftet. Du bekrefter med en
          passkey du har, før du lager den nye.
        </p>
      )}
      <BusyButton
        type="submit"
        className="button-primary"
        busy={pending}
        busyNote="venter på passkeyen …"
      >
        {submitLabel}
      </BusyButton>
      <ErrorText id={errorId}>
        {failure &&
          passkeyErrorMessage(failure, {
            conflict:
              "Passkeyen ble ikke lagt til. Den er allerede lagt til, eller du har så mange som er lov.",
            ...(needsCode && codeMessages),
          })}
      </ErrorText>
    </form>
  );
}

/**
 * Removes a passkey after a fresh confirmation (with one of the others, or
 * this one), never the last one; the sheet says how many are left.
 */
export function RemovePasskey({
  passkeyId,
  name,
  remaining,
  minimum,
  fresh,
}: {
  passkeyId: string;
  name: string;
  /** How many the steward has after this one is gone. */
  remaining: number;
  minimum: number;
  fresh: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const errorId = useId();
  const { run, pending, failure, setFailure } = useCeremony();
  const command = useCommand({
    path: "/api/account/passkeys/remove",
    done: `Passkeyen «${name}» er fjernet`,
  });

  function close() {
    dialog.current?.close();
    setFailure(null);
  }

  async function remove() {
    if (!fresh && !(await run(confirmWithPasskey))) return;
    if (await command.run({ passkeyId })) close();
  }

  const busy = pending || command.pending;
  const error =
    (failure && passkeyErrorMessage(failure)) ??
    (command.failure &&
      passkeyErrorMessage(command.failure, {
        forbidden: "Den siste passkeyen kan ikke fjernes.",
      }));

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()}>
        Fjern <span className="visually-hidden">«{name}»</span>
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby={titleId}
        onClose={close}
      >
        <h2 id={titleId}>Fjerne «{name}»?</h2>
        <p>Den kan ikke brukes til å bekrefte lenger.</p>
        <p>
          {remaining >= minimum
            ? `Du har fortsatt ${remaining}.`
            : `Du har bare ${remaining} igjen. Med under ${minimum} er forvalterhandlingene stengt til du legger til en ny.`}
        </p>
        <p>Du får varsel om det, også på e-post.</p>
        {!fresh && (
          <p className="help">
            Det er mer enn 10 minutter siden du bekreftet, så du bekrefter med
            passkey først.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Avbryt
          </button>
          <BusyButton
            type="button"
            className="button-danger"
            busy={busy}
            busyNote={pending ? "venter på passkeyen …" : "sender …"}
            onClick={() => void remove()}
          >
            Fjern passkeyen
          </BusyButton>
        </div>
        <ErrorText id={errorId}>{error}</ErrorText>
      </dialog>
    </>
  );
}

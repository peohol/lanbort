"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { type ApiFailureCode, postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { type Consequences, ConsequenceList } from "./confirm-action";
import { errorMessage } from "./error-messages";
import { ErrorText, fieldErrorProps } from "./error-text";
import { useCommand } from "./use-command";

/**
 * A sensitive command (docs/architecture/04): like `ConfirmAction`, the
 * button opens the consequence view (UX-INT-007), and the user then proves
 * their identity again with a new e-mail code before the command is sent.
 * The code goes only to the account's own address.
 */
export function ReauthenticatedAction({
  label,
  title,
  consequences,
  confirmLabel,
  path,
  body,
  danger = false,
}: {
  label: string;
  title: string;
  consequences: Consequences;
  /** Names the consequence, e.g. «Avvikle Borettslaget». */
  confirmLabel: string;
  path: string;
  body: object;
  danger?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const codeId = useId();
  const errorId = useId();
  const command = useCommand({ path, done: confirmLabel });
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailureCode | null>(null);

  useEffect(() => {
    if (codeSent) codeInput.current?.focus();
  }, [codeSent]);

  function close() {
    dialog.current?.close();
    setCodeSent(false);
    setCode("");
    setFailure(null);
  }

  async function sendCode() {
    setPending(true);
    setFailure(null);
    const result = await postJson("/api/auth/reauthenticate", {});
    setPending(false);

    if (!result.ok) {
      setFailure(result.code);
      return;
    }

    setCodeSent(true);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    const proven = await postJson("/api/auth/reauthenticate/verify", { code });
    setPending(false);

    if (!proven.ok) {
      setFailure(proven.code);
      return;
    }

    if (await command.run(body)) close();
  }

  const busy = pending || command.pending;
  const error = failure ? errorMessage(failure) : command.error;

  return (
    <>
      <button
        type="button"
        className={danger ? "button-danger" : undefined}
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
        <h2 id={titleId}>{title}</h2>
        <ConsequenceList consequences={consequences} />
        {codeSent ? (
          <form onSubmit={(event) => void confirm(event)} aria-busy={busy}>
            <p role="status">
              Vi har sendt en kode til e-postadressen din. Skriv den inn for å
              bekrefte.
            </p>
            <label htmlFor={codeId}>Kode fra e-posten</label>
            <input
              id={codeId}
              ref={codeInput}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              required
              {...fieldErrorProps(failure, errorId)}
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
            />
            <div className="dialog-actions">
              <button type="button" onClick={close}>
                Avbryt
              </button>
              <BusyButton
                type="submit"
                className={danger ? "button-danger" : "button-primary"}
                busy={busy}
              >
                {confirmLabel}
              </BusyButton>
            </div>
          </form>
        ) : (
          <>
            <p>
              Av sikkerhetshensyn bekrefter du med en kode vi sender til
              e-postadressen din.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={close}>
                Avbryt
              </button>
              <BusyButton
                type="button"
                className="button-primary"
                busy={busy}
                onClick={() => void sendCode()}
              >
                Send kode
              </BusyButton>
            </div>
          </>
        )}
        <ErrorText id={errorId}>{error}</ErrorText>
      </dialog>
    </>
  );
}

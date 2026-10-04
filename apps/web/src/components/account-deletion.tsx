"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type ApiFailureCode, postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { errorMessage } from "./error-messages";
import { ErrorText, fieldErrorProps } from "./error-text";

/** The conflict here means something new binds the account. */
const deletionMessage = (code: ApiFailureCode) =>
  code === "conflict"
    ? "Kontoen kan ikke slettes ennå. Last siden på nytt for å se hva som må avsluttes først."
    : errorMessage(code);

type Step = "start" | "code";

/**
 * PS-ADM-004–006: deleting one's own account. The server asks for the
 * identity to be proven again just before (docs/architecture/08), so the
 * user gets a new code by e-mail and confirms with it; the deletion follows
 * at once and signs them out. The consequences are shown on the page before
 * this (UX-INT-007).
 */
export function AccountDeletion() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailureCode | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode() {
    setPending(true);
    setError(null);
    const result = await postJson("/api/auth/reauthenticate", {});
    setPending(false);

    if (!result.ok) {
      setError(result.code);
      return;
    }

    setStep("code");
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const proven = await postJson("/api/auth/reauthenticate/verify", { code });
    const deleted = proven.ok
      ? await postJson("/api/account/deletion", {})
      : proven;

    if (!deleted.ok) {
      setPending(false);
      setError(deleted.code);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return step === "start" ? (
    <>
      <BusyButton type="button" onClick={() => void sendCode()} busy={pending}>
        Slett kontoen
      </BusyButton>
      <ErrorText>{error && deletionMessage(error)}</ErrorText>
    </>
  ) : (
    <form onSubmit={(event) => void confirm(event)} aria-busy={pending}>
      <p role="status">
        Vi har sendt en kode til e-postadressen din. Skriv den inn for å slette
        kontoen for godt.
      </p>
      <label htmlFor="deletion-code">Kode fra e-posten</label>
      <input
        id="deletion-code"
        name="code"
        ref={codeInput}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        required
        {...fieldErrorProps(error, "deletion-error")}
        value={code}
        onChange={(event) => setCode(event.target.value.trim())}
      />
      <BusyButton type="submit" busy={pending}>
        Slett kontoen for godt
      </BusyButton>
      <div className="secondary-actions">
        <BusyButton
          type="button"
          onClick={() => void sendCode()}
          busy={pending}
        >
          Send ny kode
        </BusyButton>
        <BusyButton
          type="button"
          onClick={() => {
            setStep("start");
            setCode("");
            setError(null);
          }}
          busy={pending}
        >
          Avbryt
        </BusyButton>
      </div>
      <ErrorText id="deletion-error">
        {error && deletionMessage(error)}
      </ErrorText>
    </form>
  );
}

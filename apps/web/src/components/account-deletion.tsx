"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { postJson } from "./api-client";
import { errorMessage } from "./error-messages";

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
  const [error, setError] = useState<string | null>(null);
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
      setError(errorMessage(result.code));
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
      setError(
        deleted.code === "conflict"
          ? "Kontoen kan ikke slettes ennå. Last siden på nytt for å se hva som må avsluttes først."
          : errorMessage(deleted.code),
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return step === "start" ? (
    <>
      <button type="button" onClick={() => void sendCode()} disabled={pending}>
        Slett kontoen
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
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
        value={code}
        onChange={(event) => setCode(event.target.value.trim())}
      />
      <button type="submit" disabled={pending}>
        Slett kontoen for godt
      </button>
      <div className="secondary-actions">
        <button
          type="button"
          onClick={() => void sendCode()}
          disabled={pending}
        >
          Send ny kode
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("start");
            setCode("");
            setError(null);
          }}
          disabled={pending}
        >
          Avbryt
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

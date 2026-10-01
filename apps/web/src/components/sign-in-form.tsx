"use client";

import { type SignedInResponse } from "@lanbort/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { postJson } from "./api-client";
import { errorMessage } from "./error-messages";

type Step = "email" | "code";

/** UX-JRN-001 steps 1–2: e-mail address, then the one-time code. */
export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  async function sendCode() {
    setPending(true);
    setError(null);
    const result = await postJson("/api/auth/email-code", { email });
    setPending(false);

    if (!result.ok) {
      setError(errorMessage(result.code));
      return;
    }

    setStatus(`Vi har sendt en kode til ${email}.`);
    setStep("code");
  }

  async function verifyCode() {
    setPending(true);
    setError(null);
    const result = await postJson<SignedInResponse>(
      "/api/auth/email-code/verify",
      { email, code },
    );

    if (!result.ok) {
      setPending(false);
      setError(errorMessage(result.code));
      return;
    }

    router.replace(
      result.data.accountStatus === "active" ? "/" : "/registrering",
    );
    router.refresh();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void (step === "email" ? sendCode() : verifyCode());
  }

  return (
    <form onSubmit={submit} noValidate={false} aria-busy={pending}>
      {step === "email" ? (
        <>
          <p>
            Vi sender deg en engangskode på e-post. Har du ikke konto, lager vi
            en når du har bekreftet adressen.
          </p>
          <label htmlFor="email">E-postadresse</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={pending}>
            Send kode
          </button>
        </>
      ) : (
        <>
          <p role="status">{status}</p>
          <label htmlFor="code">Kode fra e-posten</label>
          <input
            id="code"
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
            Bekreft
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
                setStep("email");
                setCode("");
                setError(null);
              }}
            >
              Bruk en annen e-postadresse
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

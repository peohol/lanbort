"use client";

import { type SignedInResponse } from "@lanbort/contracts";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type ApiFailureCode, postJson } from "./api-client";
import { BusyButton } from "./busy-button";
import { emailInUseMessages, errorMessage } from "./error-messages";
import { ErrorText, fieldErrorProps } from "./error-text";

type Step = "email" | "code";

/** UX-JRN-001 steps 1–2: e-mail address, then the one-time code. */
export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailureCode | null>(null);
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
      setError(result.code);
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
      setError(result.code);
      return;
    }

    router.replace(
      result.data.accountStatus === "pending_registration"
        ? "/registrering"
        : "/",
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
            {...fieldErrorProps(error, "sign-in-error")}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <BusyButton type="submit" busy={pending}>
            Send kode
          </BusyButton>
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
            {...fieldErrorProps(error, "sign-in-error")}
            value={code}
            onChange={(event) => setCode(event.target.value.trim())}
          />
          <BusyButton type="submit" busy={pending}>
            Bekreft
          </BusyButton>
          <div className="secondary-actions">
            <BusyButton
              type="button"
              onClick={() => void sendCode()}
              busy={pending}
            >
              Send ny kode
            </BusyButton>
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
      <ErrorText id="sign-in-error">
        {error && errorMessage(error, emailInUseMessages)}
      </ErrorText>
    </form>
  );
}

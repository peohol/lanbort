"use client";

import type { SecurityStatus, TotpEnrollment } from "@lanbort/contracts";
import { useEffect, useState } from "react";
import { type ApiResult, getJson, postJson } from "./api-client";
import { CodeForm } from "./code-form";
import { errorMessage } from "./error-messages";

type Step =
  | { name: "overview" }
  | { name: "reauthenticate"; codeSent: boolean }
  | { name: "enroll"; enrollment: TotpEnrollment }
  | { name: "step-up" };

/**
 * WP-12: add an authenticator app as a second factor, and confirm the app for
 * the current session. Sensitive steps ask for a new e-mail code first when
 * the sign-in is not recent; the server decides when that is needed.
 */
export function SecuritySettings() {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [step, setStep] = useState<Step>({ name: "overview" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void getJson<SecurityStatus>("/api/account/security").then((result) =>
      result.ok ? setStatus(result.data) : setError(errorMessage(result.code)),
    );
  }, []);

  async function run<T>(
    call: () => Promise<ApiResult<T>>,
    onSuccess: (data: T) => void,
  ) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await call();
    setPending(false);

    if (result.ok) {
      onSuccess(result.data);
    } else if (result.code === "reauthentication_required") {
      setStep({ name: "reauthenticate", codeSent: false });
    } else {
      setError(errorMessage(result.code));
    }
  }

  const startEnrollment = () =>
    run(
      () => postJson<TotpEnrollment>("/api/account/security/totp", {}),
      (enrollment) => setStep({ name: "enroll", enrollment }),
    );

  const verifyApp = (code: string) =>
    run(
      () =>
        postJson<SecurityStatus>("/api/account/security/totp/verify", {
          code,
        }),
      (updated) => {
        setNotice(
          step.name === "enroll"
            ? "Autentiseringsappen er slått på."
            : "Innloggingen er bekreftet med autentiseringsappen.",
        );
        setStatus(updated);
        setStep({ name: "overview" });
      },
    );

  const sendReauthenticationCode = () =>
    run(
      () => postJson("/api/auth/reauthenticate", {}),
      () => setStep({ name: "reauthenticate", codeSent: true }),
    );

  // After confirming the identity, continue with what the user asked for.
  const reauthenticate = (code: string) =>
    run(
      () => postJson("/api/auth/reauthenticate/verify", { code }),
      () => void startEnrollment(),
    );

  if (!status) {
    return error ? (
      <p role="alert" className="error">
        {error}
      </p>
    ) : (
      <p>Henter innstillinger …</p>
    );
  }

  const isSteward = status.platformRoles.includes("platform_steward");

  return (
    <>
      {isSteward && (
        <p>
          Du er plattformforvalter. Oppgaver som plattformforvalter krever at du
          har bekreftet innloggingen med autentiseringsappen.
        </p>
      )}
      <h2>Autentiseringsapp</h2>
      <p>
        {status.totp === "verified"
          ? status.sessionAssurance === "aal2"
            ? "Slått på. Denne innloggingen er bekreftet med appen."
            : "Slått på."
          : "Ikke slått på. Med en autentiseringsapp trengs både e-posten din og telefonen din for å bekrefte viktige handlinger."}
      </p>

      {step.name === "overview" && status.totp !== "verified" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => void startEnrollment()}
        >
          Slå på autentiseringsapp
        </button>
      )}

      {step.name === "overview" &&
        status.totp === "verified" &&
        status.sessionAssurance === "aal1" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStep({ name: "step-up" })}
          >
            Bekreft med autentiseringsappen
          </button>
        )}

      {step.name === "reauthenticate" &&
        (step.codeSent ? (
          <CodeForm
            id="reauth-code"
            label="Kode fra e-posten"
            submitLabel="Bekreft"
            pending={pending}
            onSubmit={(code) => void reauthenticate(code)}
          >
            <p role="status">Vi har sendt en ny kode til e-postadressen din.</p>
          </CodeForm>
        ) : (
          <div className="stack">
            <p>
              Av sikkerhetshensyn må du bekrefte at det er deg. Vi sender en
              kode til e-postadressen din.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => void sendReauthenticationCode()}
            >
              Send kode
            </button>
          </div>
        ))}

      {step.name === "enroll" && (
        <CodeForm
          id="totp-code"
          label="Kode fra appen"
          submitLabel="Slå på"
          pending={pending}
          onSubmit={(code) => void verifyApp(code)}
        >
          <p>
            Skann QR-koden med autentiseringsappen din, og skriv inn koden appen
            viser.
          </p>
          {/* A data URL from our own API; next/image adds nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={step.enrollment.qrCode}
            alt="QR-kode for autentiseringsappen"
            width={180}
            height={180}
          />
          <p>
            Kan du ikke skanne? Skriv inn denne nøkkelen i appen:{" "}
            <code data-testid="totp-secret">{step.enrollment.secret}</code>
          </p>
        </CodeForm>
      )}

      {step.name === "step-up" && (
        <CodeForm
          id="step-up-code"
          label="Kode fra appen"
          submitLabel="Bekreft"
          pending={pending}
          onSubmit={(code) => void verifyApp(code)}
        />
      )}

      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}
